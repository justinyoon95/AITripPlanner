import { createHash } from "node:crypto";
import { tripInputSchema } from "@/features/trips/schema";
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
    const parsed = tripInputSchema.safeParse(await readGenerationBody(request));
    if (!parsed.success)
      return Response.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Please check your trip details.",
            fieldErrors: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400, headers },
      );
    const key = createHash("sha256")
      .update(
        JSON.stringify({
          ...parsed.data,
          interests: [...parsed.data.interests].sort(),
        }),
      )
      .digest("hex");
    finish = generationGuard.acquire(key);
    const itinerary = await generateItinerary(parsed.data, request.signal);
    return Response.json({ itinerary }, { headers });
  } catch (error) {
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
      { error: { code: failure.code, message: failure.message } },
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
