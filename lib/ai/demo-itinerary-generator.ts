import type { Trip } from "@prisma/client";

import {
  generatedItinerarySchema,
  validateGeneratedItineraryForTrip,
  type GeneratedItinerary,
} from "@/lib/ai/itinerary-schema";
import { getInclusiveTripDayCount } from "@/lib/utils/dates";

const demoActivities = [
  {
    timeBlock: "MORNING" as const,
    name: "Neighborhood breakfast walk",
    description:
      "Start with a relaxed walk through a central neighborhood and stop for a locally known breakfast spot.",
    estimatedCostCents: 2200,
    reason:
      "It gives the day an easy start while introducing local food and street life.",
    category: "Food",
    locationHint: "Central neighborhood",
    sortOrder: 1,
  },
  {
    timeBlock: "AFTERNOON" as const,
    name: "Culture and landmark route",
    description:
      "Visit a major landmark, museum, or historic district with enough time to explore without rushing.",
    estimatedCostCents: 3800,
    reason:
      "This balances sightseeing value with a predictable afternoon schedule.",
    category: "Culture",
    locationHint: "Historic center",
    sortOrder: 2,
  },
  {
    timeBlock: "EVENING" as const,
    name: "Dinner and evening viewpoint",
    description:
      "Have dinner near a scenic district, then finish with a viewpoint, promenade, or lively public square.",
    estimatedCostCents: 5200,
    reason:
      "It closes the day with food, atmosphere, and a memorable low-effort activity.",
    category: "Dining",
    locationHint: "Scenic district",
    sortOrder: 3,
  },
];

export function generateDemoItineraryForTrip(trip: Trip) {
  const dayCount = getInclusiveTripDayCount(trip.startDate, trip.endDate);
  const days: GeneratedItinerary["days"] = Array.from(
    { length: dayCount },
    (_, index) => {
      const date = new Date(trip.startDate);
      date.setUTCDate(trip.startDate.getUTCDate() + index);

      const estimatedCostCents = demoActivities.reduce(
        (total, activity) => total + activity.estimatedCostCents,
        0,
      );

      return {
        dayNumber: index + 1,
        date: date.toISOString(),
        summary: `${trip.destination} highlights for day ${index + 1}`,
        estimatedCostCents,
        activities: demoActivities.map((activity) => ({
          ...activity,
          name: `${activity.name} in ${trip.destination}`,
        })),
      };
    },
  );

  const itinerary = generatedItinerarySchema.parse({
    days,
    totalEstimatedCostCents: days.reduce(
      (total, day) => total + day.estimatedCostCents,
      0,
    ),
  });

  return {
    itinerary: validateGeneratedItineraryForTrip(itinerary, trip),
    model: "demo-itinerary-generator",
  };
}
