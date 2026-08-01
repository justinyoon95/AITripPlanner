"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { saveItineraryVersionForUser } from "@/lib/services/itinerary-service";
import {
  createTripForUser,
  deleteTripForUser,
  updateTripForUser,
} from "@/lib/services/trip-service";
import { tripInputSchema, type TripInput } from "@/lib/validation/trip-input";
import {
  generatedItinerarySchema,
  type GeneratedItinerary,
} from "@/lib/ai/itinerary-schema";

export type CreateTripActionState = {
  error?: string;
};

export async function createTripAction(
  input: TripInput,
): Promise<CreateTripActionState> {
  const user = await requireUser();
  const result = tripInputSchema.safeParse(input);

  if (!result.success) {
    return {
      error: z.prettifyError(result.error),
    };
  }

  const trip = await createTripForUser(user.id, result.data);

  revalidatePath("/dashboard");
  redirect(`/trips/${trip.id}`);
}

export async function deleteTripAction(tripId: string) {
  const user = await requireUser();

  await deleteTripForUser(user.id, tripId);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function updateTripAction(
  tripId: string,
  input: TripInput,
): Promise<CreateTripActionState> {
  const user = await requireUser();
  const result = tripInputSchema.safeParse(input);

  if (!result.success) {
    return {
      error: z.prettifyError(result.error),
    };
  }

  await updateTripForUser(user.id, tripId, result.data);

  revalidatePath("/dashboard");
  revalidatePath(`/trips/${tripId}`);
  redirect(`/trips/${tripId}`);
}

export async function saveItineraryAction(
  tripId: string,
  itinerary: GeneratedItinerary,
  model: string,
) {
  const user = await requireUser();
  const parsed = generatedItinerarySchema.parse(itinerary);

  const savedItinerary = await saveItineraryVersionForUser(
    user.id,
    tripId,
    parsed,
    model,
  );

  revalidatePath(`/trips/${tripId}`);

  return savedItinerary;
}
