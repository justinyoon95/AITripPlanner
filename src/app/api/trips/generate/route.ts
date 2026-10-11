import { createHash } from "node:crypto";
import { z } from "zod";
import { validateNewTrip } from "@/lib/validate-trip";
import { generateItinerary } from "@/lib/ai/itinerary-service";
import { GenerationError } from "@/lib/ai/errors";
import { readGenerationBody } from "@/lib/ai/request-body";
import { generationGuard } from "@/lib/ai/request-guard";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  let finish: (() => void) | undefined;
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new GenerationError(
        "INVALID_ORIGIN",
        "Please request a trip from this application.",
        403,
      );
    const input = validateNewTrip(await readGenerationBody(request));
    const key = createHash("sha256")
      .update(
        JSON.stringify({
          ...input,
          interests: [...input.interests].sort(),
        }),
      )
      .digest("hex");
    finish = generationGuard.acquire(key);
    const itinerary = await generateItinerary(input, request.signal);
    return Response.json({ itinerary }, { headers });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of error.issues)
        (fieldErrors[issue.path.join(".")] ??= []).push(issue.message);
      return Response.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Please check the highlighted trip details.",
            fieldErrors,
          },
        },
        { status: 400, headers },
      );
    }
    const failure =
      error instanceof GenerationError
        ? error
        : new GenerationError(
            "GENERATION_FAILED",
            "We couldn't generate your itinerary. Please try again.",
            500,
          );
    if (failure.status >= 500)
      console.error("Trip generation failed", {
        code: failure.code,
        status: failure.status,
      });
    return Response.json(
      {
        error: {
          code: failure.code,
          message: failure.message,
          ...(failure.code === "INVALID_DESTINATION"
            ? { fieldErrors: { destination: [failure.message] } }
            : failure.fieldErrors
              ? { fieldErrors: failure.fieldErrors }
              : {}),
        },
      },
      {
        status: failure.status,
        headers: {
          ...headers,
          ...(failure.status === 429 ? { "Retry-After": "20" } : {}),
        },
      },
    );
  } finally {
    finish?.();
  }
}
