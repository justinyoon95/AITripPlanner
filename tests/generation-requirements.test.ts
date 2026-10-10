import { expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import { aiOutputSchemaForTrip } from "@/lib/ai/output-schema";
import { generationRequirements } from "@/lib/ai/generation-requirements";
import { normalizeAIItinerary } from "@/lib/ai/itinerary-service";
import { itineraryInput } from "@/lib/ai/prompts";
import { aiFixture, input } from "./fixtures";

it.each(["relaxed", "moderate", "packed"] as const)(
  "constrains Structured Outputs to the requested %s pace",
  (pace) => {
    const trip = { ...input, pace };
    const schema = aiOutputSchemaForTrip(trip);
    const fixture = aiFixture(trip);
    expect(schema.safeParse(fixture).success).toBe(true);
    fixture.days[0].activities.pop();
    expect(schema.safeParse(fixture).success).toBe(false);
    const format = zodTextFormat(schema, "trip_itinerary");
    expect(format.schema).toMatchObject({
      properties: {
        days: {
          minItems: 3,
          maxItems: 3,
          items: {
            properties: {
              activities: {
                minItems: generationRequirements(trip).activitiesPerDay,
                maxItems: generationRequirements(trip).activitiesPerDay,
              },
              date: { enum: ["2026-12-01", "2026-12-02", "2026-12-03"] },
            },
          },
        },
      },
    });
  },
);
it.each([1, 14])("enforces %i inclusive days", (count) => {
  const trip = {
    ...input,
    endDate: `2026-12-${String(count).padStart(2, "0")}`,
  };
  const schema = aiOutputSchemaForTrip(trip);
  const fixture = aiFixture(trip);
  expect(schema.safeParse(fixture).success).toBe(true);
  fixture.days.push(structuredClone(fixture.days[0]));
  expect(schema.safeParse(fixture).success).toBe(false);
});
it("supplies an explicit UTC calendar across month/leap-day boundaries", () => {
  const trip = { ...input, startDate: "2028-02-28", endDate: "2028-03-01" };
  expect(JSON.parse(itineraryInput(trip))).toMatchObject({
    activitiesPerDay: 3,
    inclusiveDayCount: 3,
    requiredDays: [
      { number: 1, date: "2028-02-28" },
      { number: 2, date: "2028-02-29" },
      { number: 3, date: "2028-03-01" },
    ],
  });
});
it.each([
  ["count", "INVALID_AI_DAY_COUNT", "requires 3"],
  ["date", "INVALID_AI_DATES", "Day 2"],
  ["number", "INVALID_AI_DATES", "Day 2"],
  ["pace", "INVALID_AI_PACE", "moderate pace requires 3"],
  ["overlap", "INVALID_AI_TIMING", "overlapping"],
  ["midnight", "INVALID_AI_TIMING", "past midnight"],
])(
  "rejects %s with a specific safe reason rather than the generic date/pace message",
  (kind, code, message) => {
    const fixture = aiFixture();
    const original = structuredClone(fixture);
    if (kind === "count") fixture.days.pop();
    if (kind === "date") fixture.days[1].date = "2026-12-01";
    if (kind === "number") fixture.days[1].number = 1;
    if (kind === "pace") fixture.days[1].activities.pop();
    if (kind === "overlap") fixture.days[0].activities[1].time = "09:30";
    if (kind === "midnight") fixture.days[0].activities[2].time = "23:30";
    expect(() => normalizeAIItinerary(fixture, input)).toThrowError(
      expect.objectContaining({
        code,
        message: expect.stringContaining(message),
      }),
    );
    expect(fixture.overview).toBe(original.overview);
  },
);
it("accepts adjacent activities finishing exactly at midnight without rescheduling anything", () => {
  const fixture = aiFixture();
  const day = fixture.days[0];
  day.activities[1].time = "10:30";
  day.activities[2].time = "22:30";
  const normalized = normalizeAIItinerary(fixture, input);
  expect(
    normalized.days[0].activities.map((activity) => activity.time),
  ).toEqual(["09:00", "10:30", "22:30"]);
});
