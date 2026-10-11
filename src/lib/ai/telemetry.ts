import type { ResponseUsage } from "openai/resources/responses/responses";

export type AIObservation = {
  model: string;
  promptVersion: string;
  latencyMs: number;
  usage: ResponseUsage | null;
  status: string;
  rawOutput: unknown;
};
export type AIObserver = (event: AIObservation) => void;

// Optional server-side evaluation observer; never included in browser API responses.
export function observeAI(
  observer: AIObserver | undefined,
  event: AIObservation,
) {
  try {
    observer?.(event);
  } catch {
    /* Observability must not change application behavior. */
  }
}

export async function observeResponse<
  T extends {
    model?: string;
    status?: string | null;
    usage?: ResponseUsage | null;
    output_parsed?: unknown;
  },
>(
  call: () => Promise<T>,
  metadata: { model: string; promptVersion: string },
  observer?: AIObserver,
): Promise<T> {
  const started = performance.now();
  try {
    const response = await call();
    observeAI(observer, {
      ...metadata,
      model: response.model ?? metadata.model,
      latencyMs: performance.now() - started,
      usage: response.usage ?? null,
      status: response.status ?? "unknown",
      rawOutput: response.output_parsed,
    });
    return response;
  } catch (error) {
    observeAI(observer, {
      ...metadata,
      latencyMs: performance.now() - started,
      usage: null,
      status: "provider_request_failed",
      rawOutput: null,
    });
    throw error;
  }
}
