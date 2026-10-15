import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Destination } from "@/features/trips/planning-schema";
const city: Destination = {
  id: "1850147",
  name: "Tokyo",
  region: "Tokyo",
  country: "Japan",
  countryCode: "JP",
  latitude: 35.69,
  longitude: 139.69,
  timezone: "Asia/Tokyo",
};
const providerPhoto = {
  id: "test",
  description: "Tokyo Japan skyline",
  alt_description: "Tokyo city, Japan",
  urls: { regular: "https://images.unsplash.com/photo-test?ixid=keep" },
  links: {
    html: "https://unsplash.com/photos/test",
    download_location:
      "https://api.unsplash.com/photos/test/download?ixid=retain-me",
  },
  user: {
    name: "Example photographer",
    links: { html: "https://unsplash.com/@example" },
  },
};
const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-not-real");
  vi.stubEnv("DESTINATION_PHOTOS_ENABLED", "true");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it.each(["missing key", "disabled"])(
  "makes no external calls with %s",
  async (mode) => {
    vi.stubEnv(
      mode === "disabled"
        ? "DESTINATION_PHOTOS_ENABLED"
        : "UNSPLASH_ACCESS_KEY",
      "",
    );
    const { destinationPhoto } = await import("@/lib/destination-photos");
    expect(await destinationPhoto(city)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  },
);
it("uses canonical city/region/country, retains hotlink parameters and supplies attribution", async () => {
  fetchMock.mockResolvedValue(Response.json({ results: [providerPhoto] }));
  const { destinationPhoto } = await import("@/lib/destination-photos");
  const photo = await destinationPhoto(city);
  expect(String(fetchMock.mock.calls[0][0])).toContain(
    "Tokyo+Tokyo+Japan+city+skyline+travel",
  );
  expect(photo?.url).toContain("ixid=keep");
  expect(photo?.url).toBe(providerPhoto.urls.regular);
  expect(JSON.stringify(photo)).not.toContain("test-not-real");
  expect(photo?.photographerURL).toContain("utm_source=tripplannerai");
  expect(photo?.photographerURL).toContain("utm_medium=referral");
  expect(photo?.photoURL).toContain("utm_source=tripplannerai");
  expect(photo?.photoURL).toContain("utm_medium=referral");
  expect(photo?.cityId).toBe(city.id);
});
it("deduplicates simultaneous requests and reuses cache", async () => {
  fetchMock.mockResolvedValue(Response.json({ results: [providerPhoto] }));
  const { destinationPhoto } = await import("@/lib/destination-photos");
  await Promise.all([destinationPhoto(city), destinationPhoto(city)]);
  await destinationPhoto(city);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("refreshes expired positive cache", async () => {
  vi.useFakeTimers();
  fetchMock.mockImplementation(async () =>
    Response.json({ results: [providerPhoto] }),
  );
  const { destinationPhoto } = await import("@/lib/destination-photos");
  await destinationPhoto(city);
  vi.advanceTimersByTime(24 * 60 * 60_000 + 1);
  await destinationPhoto(city);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it.each(["Paris France skyline", "Tokyo Texas skyline", "A beautiful city"])(
  "declines unrelated or geographically uncertain captions: %s",
  async (description) => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        results: [{ ...providerPhoto, description, alt_description: null }],
      }),
    );
    expect(
      await (await import("@/lib/destination-photos")).destinationPhoto(city),
    ).toBeNull();
  },
);
it.each([429, 500, 401])(
  "handles provider HTTP %i without returning content",
  async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await expect(
      (await import("@/lib/destination-photos")).destinationPhoto(city),
    ).rejects.toThrow("unavailable");
  },
);
it("rejects malformed responses and untrusted image URLs", async () => {
  fetchMock.mockResolvedValueOnce(
    Response.json({
      results: [
        { ...providerPhoto, urls: { regular: "https://evil.example/photo" } },
      ],
    }),
  );
  await expect(
    (await import("@/lib/destination-photos")).destinationPhoto(city),
  ).rejects.toThrow();
});
it("tracks displayed uses only through retained official provider URLs", async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json({ results: [providerPhoto] }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  const service = await import("@/lib/destination-photos");
  await expect(
    service.trackDestinationPhoto(
      "invalid",
      "00000000-0000-4000-8000-000000000001",
    ),
  ).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
  const photo = await service.destinationPhoto(city);
  await service.trackDestinationPhoto(
    photo!.usageToken,
    "00000000-0000-4000-8000-000000000001",
  );
  expect(fetchMock.mock.calls[1][0]).toBe(
    providerPhoto.links.download_location,
  );
});
it("rejects forged geographic selections before invoking the photo service", async () => {
  const { GET } = await import("@/app/api/destination-photo/route");
  const response = await GET(
    new Request(
      "http://localhost/api/destination-photo?id=99999999&q=Tokyo%2CJapan",
    ),
  );
  expect(response.status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("rejects tracking from another origin", async () => {
  const { POST } = await import("@/app/api/destination-photo/route");
  expect(
    (
      await POST(
        new Request("http://localhost/api/destination-photo?id=1850147", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
      )
    ).status,
  ).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("does not fetch beyond the conservative process quota", async () => {
  fetchMock.mockImplementation(async () => Response.json({ results: [] }));
  const { destinationPhoto } = await import("@/lib/destination-photos");
  for (let i = 0; i < 10; i++)
    await destinationPhoto({ ...city, id: String(i) });
  await expect(destinationPhoto({ ...city, id: "1000" })).rejects.toThrow(
    "quota",
  );
  expect(fetchMock).toHaveBeenCalledTimes(20);
});
const london: Destination = {
  ...city,
  id: "2643743",
  name: "London",
  region: "England",
  country: "United Kingdom",
  countryCode: "GB",
  latitude: 51.50853,
  longitude: -0.12574,
  timezone: "Europe/London",
};
it.each([
  ["US", "United States", "Visit London with us"],
  ["IN", "India", "London in the sunshine"],
])(
  "does not confuse ordinary words with ISO country code %s",
  async (countryCode, country, description) => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        results: [{ ...providerPhoto, description, alt_description: null }],
      }),
    );
    expect(
      await (
        await import("@/lib/destination-photos")
      ).destinationPhoto({ ...london, countryCode, country }),
    ).toBeNull();
  },
);
it("accepts the live London caption variant without accepting generic results or tracking searches", async () => {
  fetchMock.mockResolvedValueOnce(
    Response.json({
      results: [
        {
          ...providerPhoto,
          description: null,
          alt_description: "city skyline under blue sky",
        },
        {
          ...providerPhoto,
          id: "P0_vwzQaKLw",
          description:
            "Tower Bridge in London, UK, with cloudy sky background.",
          links: {
            ...providerPhoto.links,
            download_location:
              "https://api.unsplash.com/photos/P0_vwzQaKLw/download?ixid=retain-me",
          },
        },
      ],
    }),
  );
  const result = await (
    await import("@/lib/destination-photos")
  ).destinationPhoto(london);
  expect(result?.photoId).toBe("P0_vwzQaKLw");
  expect(result?.cityId).toBe(london.id);
  expect(result?.photographerURL).toContain("utm_medium=referral");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it.each([
  ["London", "United Kingdom", "GB", "LONDON, U.K. skyline"],
  ["São Paulo", "Brazil", "BR", "Sao Paulo, Brazil skyline"],
  ["New York", "United States", "US", "New York, USA skyline"],
  ["Dubai", "United Arab Emirates", "AE", "Dubai UAE skyline"],
  ["Paris", "France", "FR", "Paris, France skyline"],
])(
  "normalizes city/country evidence for %s",
  async (name, country, countryCode, description) => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        results: [{ ...providerPhoto, description, alt_description: null }],
      }),
    );
    expect(
      await (
        await import("@/lib/destination-photos")
      ).destinationPhoto({ ...city, name, country, countryCode }),
    ).not.toBeNull();
  },
);
it.each([
  { results: [] },
  {
    results: [
      {
        ...providerPhoto,
        description: "Generic skyline",
        alt_description: null,
      },
    ],
  },
])(
  "uses one broader city-specific search after unsuitable results",
  async ({ results }) => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ results }))
      .mockResolvedValueOnce(
        Response.json({
          results: [{ ...providerPhoto, description: "London UK skyline" }],
        }),
      );
    const result = await (
      await import("@/lib/destination-photos")
    ).destinationPhoto(london);
    expect(result).not.toBeNull();
    const queries = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    expect(queries.map((url) => url.searchParams.get("query"))).toEqual([
      "London England United Kingdom city skyline travel",
      "London United Kingdom",
    ]);
    expect(
      queries.every(
        (url) => url.searchParams.get("orientation") === "landscape",
      ),
    ).toBe(true);
  },
);
it.each(["London Ontario Canada", "Londoner UK", "A beautiful city"])(
  "never substitutes unrelated captions: %s",
  async (description) => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        results: [{ ...providerPhoto, description, alt_description: null }],
      }),
    );
    const service = await import("@/lib/destination-photos");
    expect(await service.destinationPhoto(london)).toBeNull();
    expect(await service.destinationPhoto(london)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  },
);
it("does not cache transient failures or perform a fallback after a provider failure", async () => {
  fetchMock
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ results: [providerPhoto] }));
  const service = await import("@/lib/destination-photos");
  await expect(service.destinationPhoto(city)).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await service.destinationPhoto(city)).not.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("backs off globally after 429 and recovers after Retry-After", async () => {
  vi.useFakeTimers();
  fetchMock
    .mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { "Retry-After": "120" } }),
    )
    .mockResolvedValueOnce(Response.json({ results: [providerPhoto] }));
  const service = await import("@/lib/destination-photos");
  await expect(service.destinationPhoto(london)).rejects.toThrow();
  await expect(service.destinationPhoto(city)).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(120001);
  expect(await service.destinationPhoto(city)).not.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("returns bounded retry guidance and no-store on rate limits", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(null, { status: 429, headers: { "Retry-After": "120" } }),
  );
  const response = await (
    await import("@/app/api/destination-photo/route")
  ).GET(
    new Request(
      "http://localhost/api/destination-photo?id=2643743&q=London%2CEngland%2CUnited%20Kingdom",
    ),
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("120");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("tracks only the selected fallback photo, never the initial empty search", async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json({ results: [] }))
    .mockResolvedValueOnce(Response.json({ results: [providerPhoto] }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  const service = await import("@/lib/destination-photos");
  const selected = await service.destinationPhoto(city);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await service.trackDestinationPhoto(
    selected!.usageToken,
    "00000000-0000-4000-8000-000000000001",
  );
  expect(fetchMock.mock.calls[2][0]).toBe(
    providerPhoto.links.download_location,
  );
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it("searching and caching do not trigger download tracking", async () => {
  fetchMock.mockImplementation(async () =>
    Response.json({ results: [providerPhoto] }),
  );
  const service = await import("@/lib/destination-photos");
  await service.destinationPhoto(city);
  await service.destinationPhoto(city);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toContain("/search/photos");
});
it("deduplicates concurrent and repeated delivery of the same photo-use event", async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json({ results: [providerPhoto] }))
    .mockResolvedValue(new Response(null, { status: 200 }));
  const service = await import("@/lib/destination-photos");
  const photo = await service.destinationPhoto(city);
  const event = "00000000-0000-4000-8000-000000000001";
  await Promise.all([
    service.trackDestinationPhoto(photo!.usageToken, event),
    service.trackDestinationPhoto(photo!.usageToken, event),
  ]);
  await service.trackDestinationPhoto(photo!.usageToken, event);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await service.trackDestinationPhoto(
    photo!.usageToken,
    "00000000-0000-4000-8000-000000000002",
  );
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it("tracks the displayed original photo after cache loss and city-result replacement", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ results: [providerPhoto] }));
  const photo = await (
    await import("@/lib/destination-photos")
  ).destinationPhoto(city);
  vi.resetModules();
  fetchMock
    .mockResolvedValueOnce(
      Response.json({
        results: [
          {
            ...providerPhoto,
            id: "other",
            links: {
              ...providerPhoto.links,
              download_location:
                "https://api.unsplash.com/photos/other/download",
            },
          },
        ],
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  const restarted = await import("@/lib/destination-photos");
  await restarted.destinationPhoto(city);
  await restarted.trackDestinationPhoto(
    photo!.usageToken,
    "00000000-0000-4000-8000-000000000001",
  );
  expect(fetchMock.mock.calls[2][0]).toBe(
    providerPhoto.links.download_location,
  );
});
it("rejects tampered and expired usage tokens without provider requests", async () => {
  vi.useFakeTimers();
  fetchMock.mockResolvedValueOnce(Response.json({ results: [providerPhoto] }));
  const service = await import("@/lib/destination-photos");
  const photo = await service.destinationPhoto(city);
  await expect(
    service.trackDestinationPhoto(
      `x${photo!.usageToken}`,
      "00000000-0000-4000-8000-000000000001",
    ),
  ).rejects.toThrow();
  vi.advanceTimersByTime(30 * 60_000 + 1);
  await expect(
    service.trackDestinationPhoto(
      photo!.usageToken,
      "00000000-0000-4000-8000-000000000001",
    ),
  ).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("reports tracking failure and does not automatically repeat an ambiguous attempt", async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json({ results: [providerPhoto] }))
    .mockRejectedValueOnce(new Error("Network failed"));
  const service = await import("@/lib/destination-photos");
  const photo = await service.destinationPhoto(city),
    event = "00000000-0000-4000-8000-000000000001";
  await expect(
    service.trackDestinationPhoto(photo!.usageToken, event),
  ).rejects.toThrow();
  await expect(
    service.trackDestinationPhoto(photo!.usageToken, event),
  ).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("returns an error rather than false tracking success for an invalid token", async () => {
  const { POST } = await import("@/app/api/destination-photo/route");
  const response = await POST(
    new Request("http://localhost/api/destination-photo", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: JSON.stringify({
        token: "x".repeat(30),
        eventId: "00000000-0000-4000-8000-000000000001",
      }),
    }),
  );
  expect(response.status).toBe(503);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("rejects oversized tracking payloads before contacting the provider", async () => {
  const { POST } = await import("@/app/api/destination-photo/route");
  const response = await POST(
    new Request("http://localhost/api/destination-photo", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: "x".repeat(4097),
    }),
  );
  expect(response.status).toBe(413);
  expect(fetchMock).not.toHaveBeenCalled();
});
