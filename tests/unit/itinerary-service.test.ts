import { describe, expect, it } from "vitest";

import {
  getNextItineraryVersion,
  isItineraryStaleForTrip,
  selectItineraryVersion,
} from "@/lib/services/itinerary-service";

describe("itinerary service helpers", () => {
  it("starts itinerary versioning at one", () => {
    expect(getNextItineraryVersion([])).toBe(1);
  });

  it("increments from the highest existing version", () => {
    expect(getNextItineraryVersion([1, 3, 2])).toBe(4);
  });

  it("marks an itinerary stale when the trip was edited after generation", () => {
    expect(
      isItineraryStaleForTrip(
        new Date("2026-08-02T10:00:00.000Z"),
        new Date("2026-08-02T09:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("keeps an itinerary fresh when it was generated after the latest trip edit", () => {
    expect(
      isItineraryStaleForTrip(
        new Date("2026-08-02T09:00:00.000Z"),
        new Date("2026-08-02T10:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("selects the latest itinerary when no version is requested", () => {
    expect(selectItineraryVersion([{ version: 3 }, { version: 2 }])).toEqual({
      version: 3,
    });
  });

  it("selects a requested itinerary version when it exists", () => {
    expect(
      selectItineraryVersion([{ version: 3 }, { version: 2 }], 2),
    ).toEqual({ version: 2 });
  });

  it("falls back to latest itinerary when the requested version does not exist", () => {
    expect(
      selectItineraryVersion([{ version: 3 }, { version: 2 }], 99),
    ).toEqual({ version: 3 });
  });

  it("returns undefined when there are no itinerary versions", () => {
    expect(selectItineraryVersion([], 1)).toBeUndefined();
  });
});
