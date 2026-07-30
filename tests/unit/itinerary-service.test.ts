import { describe, expect, it } from "vitest";

import { getNextItineraryVersion } from "@/lib/services/itinerary-service";

describe("itinerary service helpers", () => {
  it("starts itinerary versioning at one", () => {
    expect(getNextItineraryVersion([])).toBe(1);
  });

  it("increments from the highest existing version", () => {
    expect(getNextItineraryVersion([1, 3, 2])).toBe(4);
  });
});
