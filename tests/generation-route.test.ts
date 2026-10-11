import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/trips/generate/route";
import { GenerationError } from "@/lib/ai/errors";
import { generateMockItinerary } from "@/features/trips/mock-generator";
import { input, previewId } from "./fixtures";
const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/ai/itinerary-service", () => ({ generateItinerary: generate }));
let testTime = Date.UTC(2026, 11, 1);
function request(body: unknown = input, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/trips/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  testTime += 1_000_000;
  vi.setSystemTime(testTime);
  generate.mockReset();
  generate.mockResolvedValue(generateMockItinerary(input, previewId));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("generation route", () => {
  it("returns a no-store itinerary and rejects repeated equivalent requests", async () => {
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect((await result.json()).itinerary.id).toBe(previewId);
    const duplicate = await POST(
      request({ ...input, interests: [...input.interests].reverse() }),
    );
    expect(duplicate.status).toBe(429);
    expect(duplicate.headers.get("retry-after")).toBe("20");
    expect(generate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20001);
    expect((await POST(request())).status).toBe(200);
  });
  it.each([
    { ...input, endDate: "2026-12-15" },
    { ...input, preferences: "x".repeat(1001) },
    { ...input, extra: "unsupported" },
  ])("rejects invalid inputs before generation", async (body) => {
    const result = await POST(request(body));
    expect(result.status).toBe(400);
    expect((await result.json()).error.fieldErrors).toBeDefined();
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON, cross-origin requests and non-JSON bodies", async () => {
    expect(
      (
        await POST(
          new Request("http://localhost/api/trips/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await POST(request(input, { Origin: "https://untrusted.example" })))
        .status,
    ).toBe(403);
    expect(
      (await POST(request(input, { "Content-Type": "text/plain" }))).status,
    ).toBe(415);
    expect(generate).not.toHaveBeenCalled();
  });
  it("limits actual body bytes regardless of Content-Length", async () => {
    expect((await POST(request("x".repeat(32769)))).status).toBe(413);
    expect(
      (await POST(request(input, { "Content-Length": "999999" }))).status,
    ).toBe(413);
    expect(generate).not.toHaveBeenCalled();
  });
  it("returns a safe service error and never provider details", async () => {
    generate.mockRejectedValueOnce(
      new GenerationError(
        "GENERATION_TIMEOUT",
        "Please try a shorter trip.",
        504,
      ),
    );
    const result = await POST(
      request({ ...input, destination: "Toronto, Canada" }),
    );
    expect(result.status).toBe(504);
    expect(await result.json()).toEqual({
      error: {
        code: "GENERATION_TIMEOUT",
        message: "Please try a shorter trip.",
      },
    });
    generate.mockRejectedValueOnce(
      new Error("private provider details with credentials"),
    );
    const failure = await POST(
      request({ ...input, destination: "Paris, France" }),
    );
    expect(failure.status).toBe(500);
    expect(JSON.stringify(await failure.json())).not.toContain("credentials");
  });
});
