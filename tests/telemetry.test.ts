import { expect, it, vi } from "vitest";
import { observeResponse } from "@/lib/ai/telemetry";
import { estimateCost } from "../evals/report";
const metadata = { model: "gpt-4.1-mini", promptVersion: "test-v1" };

it("records returned model, prompt version, latency and cached-token usage", async () => {
  const observer = vi.fn();
  const response = {
    model: "gpt-4.1-mini-2025-04-14",
    status: "completed",
    output_parsed: { kind: "answer" },
    usage: {
      input_tokens: 5000,
      input_tokens_details: { cached_tokens: 1000, cache_write_tokens: 0 },
      output_tokens: 1000,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 6000,
    },
  };
  expect(await observeResponse(async () => response, metadata, observer)).toBe(
    response,
  );
  expect(observer).toHaveBeenCalledWith(
    expect.objectContaining({
      ...metadata,
      model: response.model,
      usage: response.usage,
      latencyMs: expect.any(Number),
    }),
  );
  expect(estimateCost(response.model, response.usage)).toBeCloseTo(0.0033);
});
it("records failure attempts without exposing exceptions or claiming zero usage", async () => {
  const observer = vi.fn();
  const error = new Error("private credentials and transport details");
  await expect(
    observeResponse(
      async () => {
        throw error;
      },
      metadata,
      observer,
    ),
  ).rejects.toBe(error);
  expect(observer).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "provider_request_failed",
      usage: null,
      rawOutput: null,
    }),
  );
  expect(JSON.stringify(observer.mock.calls)).not.toContain(
    "private credentials",
  );
});
it("keeps missing usage unknown and cannot be broken by a telemetry callback", async () => {
  const result = { model: "gpt-4.1-mini", status: "completed" };
  expect(
    await observeResponse(
      async () => result,
      metadata,
      () => {
        throw new Error("observer failed");
      },
    ),
  ).toBe(result);
  expect(estimateCost(metadata.model, null)).toBeNull();
});
