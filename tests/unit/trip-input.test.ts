import { describe, expect, it } from "vitest";

import {
  parseTripFormInput,
  tripFormSchema,
  normalizedTripInputSchema,
  tripInputSchema,
} from "@/lib/validation/trip-input";

const validTripInput = {
  destination: "Tokyo",
  startDate: "2026-06-01",
  endDate: "2026-06-07",
  budget: 2500,
  interests: ["food", "culture"],
  travelStyle: "FOODIE",
};

describe("trip input validation", () => {
  it("accepts valid trip input", () => {
    expect(tripInputSchema.safeParse(validTripInput).success).toBe(true);
  });

  it("normalizes budget dollars to cents", () => {
    const result = normalizedTripInputSchema.parse(validTripInput);

    expect(result.budgetCents).toBe(250000);
  });

  it("rejects trips where the end date is before the start date", () => {
    const result = tripInputSchema.safeParse({
      ...validTripInput,
      endDate: "2026-05-31",
    });

    expect(result.success).toBe(false);
  });

  it("rejects trips longer than 14 days", () => {
    const result = tripInputSchema.safeParse({
      ...validTripInput,
      endDate: "2026-06-20",
    });

    expect(result.success).toBe(false);
  });

  it("requires at least one interest", () => {
    const result = tripInputSchema.safeParse({
      ...validTripInput,
      interests: [],
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid browser form input", () => {
    expect(
      tripFormSchema.safeParse({
        destination: "Seoul",
        startDate: "2026-07-01",
        endDate: "2026-07-05",
        budget: 1800,
        interestsText: "cafes, palaces, markets",
        travelStyle: "CULTURE",
      }).success,
    ).toBe(true);
  });

  it("parses comma-separated form interests into an interests array", () => {
    const result = parseTripFormInput({
      destination: "Seoul",
      startDate: "2026-07-01",
      endDate: "2026-07-05",
      budget: 1800,
      interestsText: "cafes, palaces, markets",
      travelStyle: "CULTURE",
    });

    expect(result.interests).toEqual(["cafes", "palaces", "markets"]);
  });
});
