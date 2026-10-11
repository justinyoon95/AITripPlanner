import "server-only";
import { newTripSchema, tripInputSchema } from "@/features/trips/schema";
import type { TripInput } from "@/features/trips/types";
import { resolveCity, resolveAirport } from "./geography";
import { GenerationError } from "./ai/errors";
import { canonicalJSON } from "@/features/trips/fingerprint";

export function resolveTripGeography(raw: TripInput): TripInput {
  const input = structuredClone(raw);
  input.resolvedDestination = resolveCity(
    input.destination,
    input.resolvedDestination?.id,
  );
  for (const kind of ["arrival", "departure"] as const) {
    const flight = input.travel?.[kind];
    if (flight?.airportCode) {
      try {
        flight.airport = resolveAirport(flight.airportCode);
      } catch (error) {
        if (error instanceof GenerationError && error.status === 400)
          error.fieldErrors = {
            [`travel.${kind}.airportCode`]: [error.message],
          };
        throw error;
      }
    } else if (flight?.airport)
      throw new GenerationError(
        "INVALID_AIRPORT",
        "Provide the airport code before airport metadata.",
        400,
      );
  }
  return input;
}
export function validateNewTrip(raw: unknown, now = new Date()) {
  const input = newTripSchema(now).parse(raw);
  return newTripSchema(now).parse(resolveTripGeography(input));
}
// Historical trips do not need re-resolution; for new metadata-bearing snapshots
// reject forged geography before model calls without rewriting fingerprints.
export function validateStoredGeography(input: TripInput) {
  if (!input.resolvedDestination) return;
  const trusted = tripInputSchema.parse(resolveTripGeography(input));
  if (canonicalJSON(trusted) !== canonicalJSON(input))
    throw new GenerationError(
      "INVALID_GEOGRAPHY",
      "Stored location metadata does not match geographic reference data. Create a new trip or restore a valid snapshot.",
      400,
    );
}
