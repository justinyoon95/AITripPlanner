import { afterEach, expect, it, vi } from "vitest";
import type { Destination } from "@/features/trips/planning-schema";
const city: Destination = {
  id: "1",
  name: "Paris",
  region: "Ile-de-France",
  country: "France",
  countryCode: "FR",
  latitude: 48.85,
  longitude: 2.35,
  timezone: "Europe/Paris",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("deduplicates browser requests and revisits for the same geographic ID", async () => {
  vi.resetModules();
  const fetch = vi.fn().mockResolvedValue(Response.json({ photo: null }));
  vi.stubGlobal("fetch", fetch);
  const { requestDestinationPhoto } =
    await import("@/features/trips/photo-client");
  await Promise.all([
    requestDestinationPhoto(city),
    requestDestinationPhoto(city),
  ]);
  await requestDestinationPhoto(city);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toContain("France");
});
it("rejects mismatched destination metadata", async () => {
  vi.resetModules();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        photo: {
          photoId: "test",
          usageToken: "x".repeat(30),
          cityId: "2",
          url: "https://images.unsplash.com/test",
          alt: "Test",
          photographer: "Example",
          photographerURL: "https://unsplash.com/@test",
          photoURL: "https://unsplash.com/photos/test",
        },
      }),
    ),
  );
  await expect(
    (await import("@/features/trips/photo-client")).requestDestinationPhoto(
      city,
    ),
  ).rejects.toThrow("mismatch");
});
it("expires failure caches to permit retry", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  const { requestDestinationPhoto } =
    await import("@/features/trips/photo-client");
  await expect(requestDestinationPhoto(city)).rejects.toThrow();
  await expect(requestDestinationPhoto(city)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(30_001);
  await expect(requestDestinationPhoto(city)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("respects rate-limit cooldown without automatic retries", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { "Retry-After": "120" } }),
    )
    .mockResolvedValueOnce(Response.json({ photo: null }));
  vi.stubGlobal("fetch", fetch);
  const { requestDestinationPhoto } =
    await import("@/features/trips/photo-client");
  await expect(requestDestinationPhoto(city)).rejects.toThrow();
  vi.advanceTimersByTime(30001);
  await expect(requestDestinationPhoto(city)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(90000);
  expect(await requestDestinationPhoto(city)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("recovers from a temporary failure on a later explicit request", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("temporary"))
    .mockResolvedValueOnce(Response.json({ photo: null }));
  vi.stubGlobal("fetch", fetch);
  const { requestDestinationPhoto } =
    await import("@/features/trips/photo-client");
  await expect(requestDestinationPhoto(city)).rejects.toThrow();
  vi.advanceTimersByTime(30001);
  expect(await requestDestinationPhoto(city)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
});
