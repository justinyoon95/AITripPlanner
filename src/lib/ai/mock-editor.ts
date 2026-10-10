import type { EditRequest } from "@/features/trips/edit-schema";
import type { AIEditOutput } from "./edit-output-schema";

// Intentionally limited, deterministic sample behavior; never impersonates real AI.
export function mockEdit(request: EditRequest): AIEditOutput {
  const dayNumber = request.message.match(/\bday\s+(\d+)\b/i)?.[1];
  const day = request.scope
    ? request.itinerary.days.find((item) => item.id === request.scope!.dayId)
    : dayNumber
      ? request.itinerary.days.find((item) => item.number === Number(dayNumber))
      : request.itinerary.days.length === 1
        ? request.itinerary.days[0]
        : undefined;
  if (!day)
    return {
      kind: "clarification",
      message:
        "Sample mode: please select an activity or name a day, such as 'Make Day 2 less busy'.",
      operations: [],
    };
  const activity = request.scope?.activityId
    ? day.activities.find((item) => item.id === request.scope!.activityId)!
    : day.activities.at(-1)!;
  if (/empty|remove all|clear.*day/i.test(request.message))
    return {
      kind: "clarification",
      message: `Day ${day.number} must keep at least one activity. Try a relaxed replacement instead of an empty day.`,
      operations: [],
    };
  if (/less busy|remove|delete/i.test(request.message)) {
    if (day.activities.length === 1)
      return {
        kind: "clarification",
        message: `Day ${day.number} has only one activity. Removing it would leave the day empty; try a relaxed replacement.`,
        operations: [],
      };
    return {
      kind: "proposal",
      message:
        "Sample proposal: remove one activity and leave the rest of your trip unchanged.",
      operations: [
        { type: "remove_activity", dayId: day.id, activityId: activity.id },
      ],
    };
  }
  if (/cheaper|shopping/i.test(request.message)) {
    const draft = {
      name: activity.name,
      description: activity.description,
      category: activity.category,
      time: activity.time,
      durationMinutes: activity.durationMinutes,
      estimatedCost: activity.estimatedCost,
    };
    const shopping = /shopping/i.test(request.message);
    return {
      kind: "proposal",
      message:
        "Sample proposal: replace this planned activity. Prices remain illustrative, not destination estimates.",
      operations: [
        {
          type: "replace_activity",
          dayId: day.id,
          activityId: activity.id,
          activity: {
            ...draft,
            name: shopping
              ? "Browse local shops"
              : `${activity.name.slice(0, 90)} (budget option)`,
            category: shopping ? "Shopping" : activity.category,
            description:
              "An illustrative alternative matched to your requested change. Verify real options before traveling.",
            estimatedCost: Math.floor(activity.estimatedCost * 50) / 100,
          },
        },
      ],
    };
  }
  return {
    kind: "clarification",
    message:
      "Sample mode supports 'Make Day 2 less busy', 'Find a cheaper alternative', or 'Replace this with shopping'. Real AI mode supports broader natural-language requests.",
    operations: [],
  };
}
