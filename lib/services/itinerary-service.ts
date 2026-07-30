import { TimeBlock } from "@prisma/client";
import { notFound } from "next/navigation";

import {
  generatedItinerarySchema,
  validateGeneratedItineraryForTrip,
  type GeneratedItinerary,
} from "@/lib/ai/itinerary-schema";
import { prisma } from "@/lib/db/prisma";

export function getNextItineraryVersion(existingVersions: number[]) {
  if (existingVersions.length === 0) {
    return 1;
  }

  return Math.max(...existingVersions) + 1;
}

export async function saveItineraryVersionForUser(
  userId: string,
  tripId: string,
  itinerary: GeneratedItinerary,
  model: string,
) {
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      userId,
    },
    include: {
      itineraries: {
        select: {
          version: true,
        },
      },
    },
  });

  if (!trip) {
    notFound();
  }

  const parsed = generatedItinerarySchema.parse(itinerary);
  const validated = validateGeneratedItineraryForTrip(parsed, trip);
  const version = getNextItineraryVersion(
    trip.itineraries.map((existing) => existing.version),
  );

  return prisma.itinerary.create({
    data: {
      tripId,
      version,
      model,
      totalEstimatedCostCents: validated.totalEstimatedCostCents,
      days: {
        create: validated.days.map((day) => ({
          dayNumber: day.dayNumber,
          date: new Date(day.date),
          summary: day.summary,
          estimatedCostCents: day.estimatedCostCents,
          activities: {
            create: day.activities.map((activity) => ({
              timeBlock: activity.timeBlock as TimeBlock,
              name: activity.name,
              description: activity.description,
              estimatedCostCents: activity.estimatedCostCents,
              reason: activity.reason,
              category: activity.category,
              locationHint: activity.locationHint,
              sortOrder: activity.sortOrder,
            })),
          },
        })),
      },
    },
    select: {
      id: true,
      version: true,
    },
  });
}
