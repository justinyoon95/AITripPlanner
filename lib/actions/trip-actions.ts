"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { createTripForUser, deleteTripForUser } from "@/lib/services/trip-service";
import { tripInputSchema, type TripInput } from "@/lib/validation/trip-input";

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
