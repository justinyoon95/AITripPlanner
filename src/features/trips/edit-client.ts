import {
  editRequestSchema,
  editResponseSchema,
  type EditRequest,
} from "./edit-schema";
import { generationErrorSchema } from "./generation-contract";

export async function requestEdit(request: EditRequest, signal?: AbortSignal) {
  const input = editRequestSchema.parse(request);
  let response: Response;
  try {
    response = await fetch("/api/trips/edits/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(110000)])
        : AbortSignal.timeout(110000),
    });
  } catch {
    throw new Error(
      "The edit request could not be completed. Your itinerary is unchanged. Check your connection and try again.",
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "The server returned an unreadable edit response. Your itinerary is unchanged.",
    );
  }
  if (!response.ok) {
    const failure = generationErrorSchema.safeParse(body);
    throw new Error(
      failure.success
        ? failure.data.error.message
        : "AI editing is unavailable. Your itinerary is unchanged.",
    );
  }
  const result = editResponseSchema.safeParse(body);
  if (!result.success)
    throw new Error(
      "The server returned invalid changes. Your itinerary is unchanged.",
    );
  return result.data;
}
