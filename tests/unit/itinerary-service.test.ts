import { describe, expect, it } from "vitest";

import {
  getNextItineraryVersion,
  isItineraryStaleForTrip,
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
});
