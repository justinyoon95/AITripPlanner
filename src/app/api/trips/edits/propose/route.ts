import { createHash } from "node:crypto";
import { EditError, editRequestSchema } from "@/features/trips/edit-schema";
import { proposeItineraryEdit } from "@/lib/ai/edit-service";
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
        "Please request edits from this application.",
        403,
      );
    const parsed = editRequestSchema.safeParse(
      await readGenerationBody(request, 128 * 1024),
    );
    if (!parsed.success)
      return Response.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message:
              "Please check your edit request. Use at most 1,000 characters and eight recent messages.",
          },
        },
        { status: 400, headers },
      );
    const key = createHash("sha256")
      .update(JSON.stringify(parsed.data))
      .digest("hex");
    finish = generationGuard.acquire(`edit:${key}`);
    return Response.json(
      await proposeItineraryEdit(parsed.data, request.signal),
      { headers },
    );
  } catch (error) {
    const failure =
      error instanceof EditError
        ? new GenerationError(error.code, error.message, 422)
        : error instanceof GenerationError
          ? error
          : new GenerationError(
              "EDIT_FAILED",
              "We couldn't propose these changes. Your itinerary is unchanged.",
              500,
            );
    if (failure.status >= 500)
      console.error("Itinerary edit failed", {
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
