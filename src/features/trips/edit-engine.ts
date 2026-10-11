import { itinerarySchema } from "./schema";
import { roundMoney, summarizeCosts } from "./costs";
import { canonicalJSON } from "./fingerprint";
import {
  EditError,
  editOperationsSchema,
  type EditOperation,
  type EditScope,
} from "./edit-schema";
import type { Itinerary } from "./types";
import { travelWindow, scheduleWithinWindow } from "./travel-planning";

export function applyEditOperations(
  base: Itinerary,
  rawOperations: unknown,
  scope: EditScope | null = null,
): Itinerary {
  const original = itinerarySchema.parse(base);
  const parsed = editOperationsSchema.safeParse(rawOperations);
  if (!parsed.success)
    throw new EditError(
      "INVALID_OPERATIONS",
      "The proposed changes are invalid or exceed the six-operation limit. Please request a smaller change.",
    );
  const operations = parsed.data;
  const result = structuredClone(original);
  const touched = new Set<string>();
  const affectedDays = new Set<string>();
  const allIds = new Set([
    base.id,
    ...base.days.flatMap((day) => [
      day.id,
      ...day.activities.map((activity) => activity.id),
    ]),
  ]);
  for (const operation of operations) {
    const day = result.days.find((item) => item.id === operation.dayId);
    if (!day)
      throw new EditError(
        "UNKNOWN_TARGET",
        "The proposed day no longer exists. Please request a new proposal.",
      );
    if (
      scope &&
      (scope.dayId !== day.id ||
        (scope.activityId &&
          (!("activityId" in operation) ||
            operation.activityId !== scope.activityId)))
    )
      throw new EditError(
        "OUT_OF_SCOPE",
        "The proposal changes something outside your selected activity or day. Please request a new proposal.",
      );
    affectedDays.add(day.id);
    const target =
      operation.type === "add_activity"
        ? operation.activity.id
        : "activityId" in operation
          ? operation.activityId
          : `${day.id}:costs`;
    if (touched.has(target))
      throw new EditError(
        "CONFLICTING_OPERATIONS",
        "The proposal changes the same activity or daily costs more than once. Please split the request into separate changes.",
      );
    touched.add(target);
    if (operation.type === "add_activity") {
      if (allIds.has(operation.activity.id))
        throw new EditError(
          "DUPLICATE_ID",
          "The proposed activity identity is already in use.",
        );
      allIds.add(operation.activity.id);
      day.activities.push({
        ...operation.activity,
        estimatedCost: roundMoney(operation.activity.estimatedCost),
      });
    } else if (operation.type === "update_day_costs") {
      if (!day.additionalCosts)
        throw new EditError(
          "UNSUPPORTED_COSTS",
          "Sample previews do not contain accommodation or transport estimates. Generate a real itinerary before changing these costs.",
        );
      day.additionalCosts = {
        accommodation: roundMoney(operation.costs.accommodation),
        localTransport: roundMoney(operation.costs.localTransport),
        additionalMeals: roundMoney(operation.costs.additionalMeals),
      };
    } else {
      const index = day.activities.findIndex(
        (activity) => activity.id === operation.activityId,
      );
      if (index < 0)
        throw new EditError(
          "UNKNOWN_TARGET",
          "The proposed activity is not in the specified day. Please request a new proposal.",
        );
      if (operation.type === "remove_activity") day.activities.splice(index, 1);
      else if (operation.type === "replace_activity")
        day.activities[index] = {
          ...operation.activity,
          id: operation.activityId,
          estimatedCost: roundMoney(operation.activity.estimatedCost),
        };
      else
        day.activities[index] = {
          ...day.activities[index],
          time: operation.time,
          durationMinutes: operation.durationMinutes,
        };
    }
  }
  for (const day of result.days.filter((item) => affectedDays.has(item.id))) {
    if (
      !day.activities.length &&
      !travelWindow(result.input, day.date).travelOnly
    )
      throw new EditError(
        "EMPTY_DAY",
        `Day ${day.number} would have no activities. This milestone requires at least one activity per day. Try replacing the last activity with something relaxed instead.`,
      );
    if (day.activities.length > 4)
      throw new EditError(
        "DAY_FULL",
        `Day ${day.number} would exceed four activities. Replace or remove an activity before adding another.`,
      );
    const names = day.activities.map((activity) =>
      activity.name.trim().normalize("NFKC").toLocaleLowerCase("en"),
    );
    if (new Set(names).size !== names.length)
      throw new EditError(
        "DUPLICATE_ACTIVITY",
        `Day ${day.number} would contain duplicate activity names. Please choose a different activity.`,
      );
    day.activities.sort((a, b) => a.time.localeCompare(b.time));
    if (!scheduleWithinWindow(result.input, day.date, day.activities))
      throw new EditError(
        "INVALID_SCHEDULE",
        `Day ${day.number} conflicts with the arrival, departure, or planned accommodation window. Request a time outside those logistics; travel-only days cannot contain activities.`,
      );
  }
  if (canonicalJSON(result) === canonicalJSON(original))
    throw new EditError(
      "NO_CHANGE",
      "The proposal does not change the itinerary. Please describe a different change.",
    );
  const validation = itinerarySchema.safeParse(result);
  if (!validation.success)
    throw new EditError(
      "INVALID_SCHEDULE",
      "These changes would create overlapping activities or an invalid schedule. Please request different times or durations.",
    );
  if (
    result.source === "ai" &&
    summarizeCosts(result).total !== summarizeCosts(original).total
  ) {
    const costs = summarizeCosts(result);
    result.budgetAssessment = {
      status: costs.remaining < 0 ? "unrealistic" : "uncertain",
      explanation:
        costs.remaining < 0
          ? "The updated destination estimates exceed your budget. Consider cheaper activities or a higher budget. All prices require verification."
          : "The updated destination estimates are within your budget, but prices and affordability still require verification.",
    };
  }
  return itinerarySchema.parse(result);
}

export function describeEdits(base: Itinerary, operations: EditOperation[]) {
  return operations
    .map((operation) => {
      const day = base.days.find((item) => item.id === operation.dayId)!;
      const activity =
        "activityId" in operation
          ? day.activities.find((item) => item.id === operation.activityId)
          : undefined;
      const action =
        operation.type === "replace_activity"
          ? `replaced ${activity?.name} with ${operation.activity.name}`
          : operation.type === "add_activity"
            ? `added ${operation.activity.name}`
            : operation.type === "remove_activity"
              ? `removed ${activity?.name}`
              : operation.type === "reschedule_activity"
                ? `moved ${activity?.name} to ${operation.time}`
                : "adjusted daily cost estimates";
      return `Day ${day.number}: ${action}`;
    })
    .join("; ")
    .slice(0, 1000);
}
