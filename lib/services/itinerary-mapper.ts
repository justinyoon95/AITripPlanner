import type { Activity, Itinerary, ItineraryDay } from "@prisma/client";

import type { GeneratedItinerary } from "@/lib/ai/itinerary-schema";

type ItineraryWithDays = Itinerary & {
  days: Array<
    ItineraryDay & {
      activities: Activity[];
    }
  >;
};

export function mapSavedItineraryToGeneratedItinerary(
  itinerary: ItineraryWithDays,
): GeneratedItinerary {
  return {
    totalEstimatedCostCents: itinerary.totalEstimatedCostCents ?? 0,
    days: itinerary.days.map((day) => ({
      dayNumber: day.dayNumber,
      date: day.date.toISOString(),
      summary: day.summary ?? `Day ${day.dayNumber}`,
      estimatedCostCents: day.estimatedCostCents ?? 0,
      activities: day.activities.map((activity) => ({
        timeBlock: activity.timeBlock,
        name: activity.name,
        description: activity.description,
        estimatedCostCents: activity.estimatedCostCents,
        reason: activity.reason,
        category: activity.category,
        locationHint: activity.locationHint,
        sortOrder: activity.sortOrder,
      })),
    })),
  };
}
