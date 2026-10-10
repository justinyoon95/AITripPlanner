import { afterEach, expect, it, vi } from "vitest";
import { requestItinerary } from "@/features/trips/generate-client";
import { generateMockItinerary } from "@/features/trips/mock-generator";
import { input, previewId } from "./fixtures";
afterEach(() => vi.unstubAllGlobals());
it("posts trip details and validates the response", async () => {
  const itinerary = generateMockItinerary(input, previewId);
  const fetch = vi.fn().mockResolvedValue(Response.json({ itinerary }));
  vi.stubGlobal("fetch", fetch);
  expect(await requestItinerary(input)).toEqual(itinerary);
  expect(fetch).toHaveBeenCalledWith(
    "/api/trips/generate",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify(input),
      signal: expect.any(AbortSignal),
    }),
  );
});
it.each([
  [
    Response.json(
      {
        error: {
          code: "NOT_CONFIGURED",
          message: "Please configure AI generation.",
        },
      },
      { status: 503 },
    ),
    "Please configure AI generation.",
  ],
  [Response.json({ itinerary: {} }), "invalid itinerary"],
  [new Response("bad gateway", { status: 502 }), "unreadable response"],
  [
    Response.json({ private: "provider details" }, { status: 502 }),
    "unavailable",
  ],
])(
  "handles error or invalid responses without sample fallback",
  async (response, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(requestItinerary(input)).rejects.toThrow(message);
  },
);
it("handles network failures and timeout aborts", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
  );
  await expect(requestItinerary(input)).rejects.toThrow(
    "Check your connection",
  );
});
