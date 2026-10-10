import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { applyEditOperations } from "@/features/trips/edit-engine";
import {
  editRequestSchema,
  type EditOperation,
} from "@/features/trips/edit-schema";
import { summarizeCosts } from "@/features/trips/costs";
import { normalizeAIItinerary } from "@/lib/ai/itinerary-service";
import { aiFixture, input } from "./fixtures";
import { editRequest, removeOperation } from "./edit-fixtures";

describe("deterministic targeted edits", () => {
  it("removes only the target and preserves original IDs, input and unrelated data", () => {
    const base = editRequest().itinerary;
    const original = structuredClone(base);
    const result = applyEditOperations(base, [removeOperation()]);
    expect(base).toEqual(original);
    expect(result.days[0]).toEqual(base.days[0]);
    expect(result.days[2]).toEqual(base.days[2]);
    expect(result.days[1].activities).toEqual(
      base.days[1].activities.slice(0, -1),
    );
    expect(result.id).toBe(base.id);
    expect(result.input).toEqual(base.input);
    expect(result.days[1].id).toBe(base.days[1].id);
  });
  it("preserves a replaced activity identity and recalculates costs without altering other estimates", () => {
    const base = normalizeAIItinerary(aiFixture(), input);
    const day = base.days[0];
    const activity = day.activities[0];
    const draft = {
      name: "New cafe",
      description: "A cheaper meal",
      category: activity.category,
      time: activity.time,
      durationMinutes: activity.durationMinutes,
      estimatedCost: 3.129,
    };
    const result = applyEditOperations(base, [
      {
        type: "replace_activity",
        dayId: day.id,
        activityId: activity.id,
        activity: draft,
      },
    ]);
    expect(result.days[0].activities[0].id).toBe(activity.id);
    expect(result.days[0].activities[0].estimatedCost).toBe(3.13);
    expect(result.days[0].additionalCosts).toEqual(day.additionalCosts);
    expect(result.days.slice(1)).toEqual(base.days.slice(1));
    expect(summarizeCosts(result).total).toBe(318.13);
    expect(result.budgetAssessment?.status).toBe("uncertain");
  });
  it("applies explicit daily costs and reports an over-budget result honestly", () => {
    const base = normalizeAIItinerary(aiFixture(), input);
    const result = applyEditOperations(base, [
      {
        type: "update_day_costs",
        dayId: base.days[0].id,
        costs: { accommodation: 5000, localTransport: 10, additionalMeals: 15 },
      },
    ]);
    expect(summarizeCosts(result).total).toBe(5245);
    expect(result.budgetAssessment?.status).toBe("unrealistic");
  });
  it("adds a uniquely identified activity and sorts only the affected day", () => {
    const base = editRequest().itinerary;
    const added = {
      ...base.days[0].activities[0],
      id: randomUUID(),
      name: "Evening walk",
      time: "22:00",
      durationMinutes: 30,
    };
    const result = applyEditOperations(base, [
      { type: "add_activity", dayId: base.days[0].id, activity: added },
    ]);
    expect(result.days[0].activities.at(-1)).toEqual(added);
    expect(result.days.slice(1)).toEqual(base.days.slice(1));
  });
  it.each([
    "empty",
    "full",
    "duplicate",
    "collision",
    "overlap",
    "midnight",
    "unknown",
    "conflict",
    "noop",
    "limit",
  ])("rejects %s edits atomically", (kind) => {
    const base = editRequest().itinerary;
    const original = structuredClone(base);
    const day = base.days[0];
    const activity = day.activities[0];
    const remove: EditOperation = {
      type: "remove_activity",
      dayId: day.id,
      activityId: activity.id,
    };
    const reschedule: EditOperation = {
      type: "reschedule_activity",
      dayId: day.id,
      activityId: activity.id,
      time: "23:30",
      durationMinutes: 90,
    };
    const addition = {
      type: "add_activity" as const,
      dayId: day.id,
      activity: {
        ...activity,
        id: randomUUID(),
        name: "Walk",
        time: "22:00",
        durationMinutes: 30,
      },
    };
    const ops =
      kind === "empty"
        ? day.activities.map((a) => ({ ...remove, activityId: a.id }))
        : kind === "full"
          ? [
              addition,
              {
                ...addition,
                activity: {
                  ...addition.activity,
                  id: randomUUID(),
                  name: "Another walk",
                  time: "23:00",
                },
              },
            ]
          : kind === "duplicate"
            ? [
                {
                  ...addition,
                  activity: {
                    ...addition.activity,
                    name: ` ${activity.name.toUpperCase()} `,
                  },
                },
              ]
            : kind === "collision"
              ? [
                  {
                    ...addition,
                    activity: { ...addition.activity, id: base.id },
                  },
                ]
              : kind === "overlap"
                ? [{ ...reschedule, time: day.activities[1].time }]
                : kind === "midnight"
                  ? [reschedule]
                  : kind === "unknown"
                    ? [{ ...remove, activityId: "missing" }]
                    : kind === "conflict"
                      ? [remove, reschedule]
                      : kind === "noop"
                        ? [
                            {
                              ...reschedule,
                              time: activity.time,
                              durationMinutes: activity.durationMinutes,
                            },
                          ]
                        : Array.from({ length: 7 }, () => remove);
    expect(() => applyEditOperations(base, ops)).toThrow();
    expect(base).toEqual(original);
    if (kind === "empty")
      expect(() => applyEditOperations(base, ops)).toThrow(
        /at least one activity/,
      );
  });
  it("enforces selected scope and rejects unsupported mock cost adjustments", () => {
    const base = editRequest().itinerary;
    expect(() =>
      applyEditOperations(base, [removeOperation()], {
        dayId: base.days[0].id,
        activityId: null,
      }),
    ).toThrow(/outside/);
    expect(() =>
      applyEditOperations(base, [
        {
          type: "update_day_costs",
          dayId: base.days[0].id,
          costs: { accommodation: 0, localTransport: 0, additionalMeals: 0 },
        },
      ]),
    ).toThrow(/Sample previews/);
  });
  it("rejects conflicting daily estimates and activity-scoped changes to other entries", () => {
    const base = normalizeAIItinerary(aiFixture(), input);
    const costs = {
      type: "update_day_costs" as const,
      dayId: base.days[0].id,
      costs: base.days[0].additionalCosts!,
    };
    expect(() => applyEditOperations(base, [costs, costs])).toThrow(
      /more than once/,
    );
    const activity = base.days[0].activities[0];
    expect(() =>
      applyEditOperations(base, [costs], {
        dayId: base.days[0].id,
        activityId: activity.id,
      }),
    ).toThrow(/outside/);
  });
});
describe("edit request bounds", () => {
  it("accepts a valid request", () =>
    expect(editRequestSchema.safeParse(editRequest()).success).toBe(true));
  it.each(["message", "context", "days", "revision"])(
    "rejects invalid %s before paid calls",
    (kind) => {
      const request = editRequest();
      if (kind === "message") request.message = "x".repeat(1001);
      if (kind === "context")
        request.context = Array.from({ length: 9 }, () => ({
          role: "user" as const,
          content: "edit",
        }));
      if (kind === "days") request.itinerary.input.endDate = "2026-12-15";
      if (kind === "revision") request.baseRevision = -1;
      expect(editRequestSchema.safeParse(request).success).toBe(false);
    },
  );
});
