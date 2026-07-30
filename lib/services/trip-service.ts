import { notFound } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import {
  normalizedTripInputSchema,
  type TripInput,
} from "@/lib/validation/trip-input";

export async function createTripForUser(userId: string, input: TripInput) {
  const trip = normalizedTripInputSchema.parse(input);

  return prisma.trip.create({
    data: {
      userId,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      budgetCents: trip.budgetCents,
      interests: trip.interests,
      travelStyle: trip.travelStyle,
    },
    select: {
      id: true,
    },
  });
}

export async function updateTripForUser(
  userId: string,
  tripId: string,
  input: TripInput,
) {
  const existingTrip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      userId,
    },
    select: {
      id: true,
    },
  });

  if (!existingTrip) {
    notFound();
  }

  const trip = normalizedTripInputSchema.parse(input);

  return prisma.trip.update({
    where: {
      id: existingTrip.id,
    },
    data: {
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      budgetCents: trip.budgetCents,
      interests: trip.interests,
      travelStyle: trip.travelStyle,
    },
    select: {
      id: true,
    },
  });
}

export async function getTripsForUser(userId: string) {
  return prisma.trip.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      _count: {
        select: {
          itineraries: true,
        },
      },
    },
  });
}

export async function getTripForUser(userId: string, tripId: string) {
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      userId,
    },
    include: {
      itineraries: {
        orderBy: {
          version: "desc",
        },
        include: {
          days: {
            orderBy: {
              dayNumber: "asc",
            },
            include: {
              activities: {
                orderBy: {
                  sortOrder: "asc",
                },
              },
            },
          },
        },
      },
    },
  });

  if (!trip) {
    notFound();
  }

  return trip;
}

export async function deleteTripForUser(userId: string, tripId: string) {
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      userId,
    },
    select: {
      id: true,
    },
  });

  if (!trip) {
    notFound();
  }

  await prisma.trip.delete({
    where: {
      id: trip.id,
    },
  });
}
