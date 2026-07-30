import { z } from "zod";

import { getInclusiveTripDayCount } from "@/lib/utils/dates";

export const generatedActivitySchema = z.object({
  timeBlock: z.enum(["MORNING", "AFTERNOON", "EVENING"]),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  estimatedCostCents: z.number().int().nonnegative(),
  reason: z.string().min(1).max(500),
  category: z.string().min(1).max(60),
  locationHint: z.string().max(120).nullable(),
  sortOrder: z.number().int().min(1).max(3),
});

export const generatedItineraryDaySchema = z.object({
  dayNumber: z.number().int().positive(),
  date: z.string().min(1),
  summary: z.string().min(1).max(500),
  estimatedCostCents: z.number().int().nonnegative(),
  activities: z.array(generatedActivitySchema).length(3),
});

export const generatedItinerarySchema = z.object({
  days: z.array(generatedItineraryDaySchema).min(1).max(14),
  totalEstimatedCostCents: z.number().int().nonnegative(),
});

export type GeneratedItinerary = z.infer<typeof generatedItinerarySchema>;

export function validateGeneratedItineraryForTrip(
  itinerary: GeneratedItinerary,
  trip: {
    startDate: Date;
    endDate: Date;
  },
) {
  const expectedDayCount = getInclusiveTripDayCount(trip.startDate, trip.endDate);

  if (itinerary.days.length !== expectedDayCount) {
    throw new Error(
      `Expected ${expectedDayCount} itinerary days, received ${itinerary.days.length}.`,
    );
  }

  for (const day of itinerary.days) {
    const timeBlocks = new Set(
      day.activities.map((activity) => activity.timeBlock),
    );

    if (
      !timeBlocks.has("MORNING") ||
      !timeBlocks.has("AFTERNOON") ||
      !timeBlocks.has("EVENING")
    ) {
      throw new Error(`Day ${day.dayNumber} must include all three time blocks.`);
    }
  }

  return itinerary;
}
