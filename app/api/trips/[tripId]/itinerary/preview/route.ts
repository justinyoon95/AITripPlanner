import { NextResponse } from "next/server";

import { generateItineraryForTrip } from "@/lib/ai/itinerary-generator";
import { requireUser } from "@/lib/auth/require-user";
import { getTripForUser } from "@/lib/services/trip-service";

type ItineraryPreviewRouteContext = {
  params: Promise<{
    tripId: string;
  }>;
};

export async function POST(_request: Request, context: ItineraryPreviewRouteContext) {
  const [{ tripId }, user] = await Promise.all([context.params, requireUser()]);
  const trip = await getTripForUser(user.id, tripId);

  try {
    const preview = await generateItineraryForTrip(trip);

    return NextResponse.json(preview);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to generate itinerary preview.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
