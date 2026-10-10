import "server-only";
import { GenerationError } from "./errors";

export const MAX_REQUEST_BYTES = 32_768;
export async function readGenerationBody(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new GenerationError(
      "INVALID_CONTENT_TYPE",
      "Send trip details as JSON.",
      415,
    );
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_REQUEST_BYTES)
    throw new GenerationError(
      "REQUEST_TOO_LARGE",
      "Trip details are too large. Please shorten your preferences.",
      413,
    );
  if (!request.body)
    throw new GenerationError(
      "INVALID_REQUEST",
      "Please provide your trip details.",
      400,
    );
  const reader = request.body.getReader();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => undefined);
  }, 10_000);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (expired)
        throw new GenerationError(
          "REQUEST_TIMEOUT",
          "Trip details took too long to arrive. Please try again.",
          408,
        );
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES)
        throw new GenerationError(
          "REQUEST_TOO_LARGE",
          "Trip details are too large. Please shorten your preferences.",
          413,
        );
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new GenerationError(
        "INVALID_JSON",
        "Trip details could not be read. Please try again.",
        400,
      );
    }
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
