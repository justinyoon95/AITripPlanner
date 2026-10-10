import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storePreview, readPreview } from "../src/features/trips/storage";
import { generateMockItinerary } from "../src/features/trips/mock-generator";

const id = "c4b8cdaa-c4ea-425a-ad32-ea6f4b746057";
const trip = generateMockItinerary(
  {
    destination: "Lisbon",
    startDate: "2026-11-01",
    endDate: "2026-11-01",
    budget: 300,
    currency: "EUR",
    interests: ["Nature"],
    pace: "relaxed",
    preferences: "",
  },
  id,
);
describe("browser preview persistence", () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("round-trips a validated preview", () => {
    storePreview(trip);
    expect(readPreview(id)).toEqual(trip);
  });
  it("returns null when a preview is absent", () => {
    expect(readPreview(id)).toBeNull();
  });
  it("gives a useful error for corrupt JSON", () => {
    values.set(`trip-planner:preview:v1:${id}`, "{invalid");
    expect(() => readPreview(id)).toThrow("damaged");
  });
  it("rejects stored previews with a different identity", () => {
    values.set(
      `trip-planner:preview:v1:${id}`,
      JSON.stringify({ ...trip, id: "79aaf346-f57b-4e37-95a8-e04390923e7a" }),
    );
    expect(() => readPreview(id)).toThrow("older version");
  });
  it("reports blocked or exhausted browser storage", () => {
    vi.stubGlobal("window", {
      localStorage: {
        setItem: () => {
          throw new Error("Quota exceeded");
        },
        getItem: () => {
          throw new Error("Access denied");
        },
      },
    });
    expect(() => storePreview(trip)).toThrow("free up space");
    expect(() => readPreview(id)).toThrow("Enable site storage");
  });
});
