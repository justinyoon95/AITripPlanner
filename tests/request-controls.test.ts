import { afterEach, expect, it, vi } from "vitest";
import { createGenerationGuard } from "@/lib/ai/request-guard";
import { readGenerationBody } from "@/lib/ai/request-body";
afterEach(() => vi.useRealTimers());
it("bounds the generation guard and releases slots after expiry", () => {
  vi.useFakeTimers();
  const guard = createGenerationGuard();
  const finish = guard.acquire("same");
  expect(() => guard.acquire("same")).toThrow();
  finish();
  vi.advanceTimersByTime(20001);
  guard.acquire("same");
  for (let i = 0; i < 199; i++) guard.acquire(String(i));
  expect(() => guard.acquire("overflow")).toThrow();
  vi.advanceTimersByTime(120001);
  expect(() => guard.acquire("overflow")).not.toThrow();
});
it("times out a stalled request body and cancels its stream", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const request = {
    headers: new Headers({ "Content-Type": "application/json" }),
    body: new ReadableStream({ cancel }),
  } as Request;
  const reading = readGenerationBody(request);
  const assertion = expect(reading).rejects.toMatchObject({
    code: "REQUEST_TIMEOUT",
    status: 408,
  });
  await vi.advanceTimersByTimeAsync(10001);
  await assertion;
  expect(cancel).toHaveBeenCalled();
});
