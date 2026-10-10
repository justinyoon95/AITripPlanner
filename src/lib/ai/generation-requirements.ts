import { DAY_MS, tripDayCount, tripInputSchema } from "@/features/trips/schema";
import type { TripInput } from "@/features/trips/types";
import type { z } from "zod";
import type { aiOutputSchema } from "./output-schema";
import { GenerationError } from "./errors";

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
  return { dayCount, activitiesPerDay, days };
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
    if (day.activities.length !== required.activitiesPerDay)
      throw new GenerationError(
        "INVALID_AI_PACE",
        `The AI returned ${day.activities.length} activities on Day ${index + 1}; ${input.pace} pace requires ${required.activitiesPerDay}. No itinerary was saved. Please try again.`,
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
  });
}
