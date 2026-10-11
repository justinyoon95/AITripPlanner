import {
  generationErrorSchema,
  generationSuccessSchema,
} from "./generation-contract";
export class TripValidationError extends Error {
  constructor(
    message: string,
    public fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}
import type { Itinerary, TripInput } from "./types";

export async function requestItinerary(
  input: TripInput,
  signal?: AbortSignal,
): Promise<Itinerary> {
  let response: Response;
  try {
    response = await fetch("/api/trips/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(110_000)])
        : AbortSignal.timeout(110_000),
    });
  } catch {
    throw new Error(
      "We couldn't complete the request. Check your connection and try again, or choose a shorter trip.",
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "The server returned an unreadable response. Please try again.",
    );
  }
  if (!response.ok) {
    const result = generationErrorSchema.safeParse(body);
    throw new TripValidationError(
      result.success
        ? result.data.error.message
        : "Trip generation is unavailable. Please try again later.",
      result.success ? result.data.error.fieldErrors : undefined,
    );
  }
  const result = generationSuccessSchema.safeParse(body);
  if (!result.success)
    throw new Error(
      "The server returned an invalid itinerary. Please try again.",
    );
  return result.data.itinerary;
}
