import { DAY_MS, tripDayCount, tripInputSchema } from "@/features/trips/schema";
import type { TripInput } from "@/features/trips/types";
import type { z } from "zod";
import type { aiOutputSchema } from "./output-schema";
import { GenerationError } from "./errors";
import {
  travelWindow,
  scheduleWithinWindow,
} from "@/features/trips/travel-planning";

export function generationRequirements(raw: TripInput) {
  const input = tripInputSchema.parse(raw);
  const dayCount = tripDayCount(input.startDate, input.endDate);
  const activitiesPerDay =
    input.pace === "relaxed" ? 2 : input.pace === "moderate" ? 3 : 4;
  const days = Array.from({ length: dayCount }, (_, index) => ({
    number: index + 1,
    date: new Date(Date.parse(`${input.startDate}T00:00:00Z`) + index * DAY_MS)
      .toISOString()
      .slice(0, 10),
  }));
  const windows = days.map((day) => {
    const window = travelWindow(input, day.date);
    const activityCount = window.travelOnly
      ? 0
      : window.constrained
        ? Math.min(
            activitiesPerDay,
            Math.max(1, Math.floor((window.end - window.start) / 120)),
          )
        : activitiesPerDay;
    return { ...day, ...window, activityCount };
  });
  return { dayCount, activitiesPerDay, days, windows };
}

// Structured Outputs cannot express cross-field date order or interval arithmetic.
export function validateGeneratedSchedule(
  output: z.infer<typeof aiOutputSchema>,
  input: TripInput,
) {
  const required = generationRequirements(input);
  if (output.days.length !== required.dayCount)
    throw new GenerationError(
      "INVALID_AI_DAY_COUNT",
      `The AI returned ${output.days.length} days, but your trip requires ${required.dayCount}. No itinerary was saved. Please try again.`,
    );
  output.days.forEach((day, index) => {
    const expected = required.days[index];
    if (day.number !== expected.number || day.date !== expected.date)
      throw new GenerationError(
        "INVALID_AI_DATES",
        `The AI returned incorrect dates or day ordering for Day ${index + 1}. No itinerary was saved. Please try again.`,
      );
    const window = required.windows[index];
    if (day.activities.length !== window.activityCount)
      throw new GenerationError(
        "INVALID_AI_PACE",
        `The AI returned ${day.activities.length} activities on Day ${index + 1}; ${input.pace} pace requires ${window.activityCount}${window.constrained ? " after travel constraints" : ""}. No itinerary was saved. Please try again.`,
      );
    let previousEnd = 0;
    for (const activity of day.activities) {
      const [hour, minute] = activity.time.split(":").map(Number);
      const start = hour * 60 + minute;
      const end = start + activity.durationMinutes;
      if (end > 1440)
        throw new GenerationError(
          "INVALID_AI_TIMING",
          `An AI activity on Day ${index + 1} runs past midnight. No itinerary was saved. Please try again.`,
        );
      if (start < previousEnd)
        throw new GenerationError(
          "INVALID_AI_TIMING",
          `The AI returned overlapping or out-of-order activities on Day ${index + 1}. No itinerary was saved. Please try again.`,
        );
      previousEnd = end;
    }
    if (!scheduleWithinWindow(input, day.date, day.activities))
      throw new GenerationError(
        "INVALID_AI_TRAVEL_WINDOW",
        `Day ${index + 1} conflicts with your travel or accommodation logistics. No itinerary was saved.`,
        502,
      );
  });
}
