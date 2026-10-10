import { describe, expect, it } from "vitest";
import {
  tripInputSchema,
  itinerarySchema,
  dateSchema,
  tripDayCount,
} from "../src/features/trips/schema";
import { generateMockItinerary } from "../src/features/trips/mock-generator";
import { summarizeCosts } from "../src/features/trips/costs";
import type { TripInput } from "../src/features/trips/types";

const input: TripInput = {
  destination: "Kyoto, Japan",
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  budget: 1500,
  currency: "USD",
  interests: ["Food", "Culture"],
  pace: "moderate",
  preferences: "Vegetarian meals",
};
const id = "c4b8cdaa-c4ea-425a-ad32-ea6f4b746057";
describe("trip validation", () => {
  it("trims destination and notes", () => {
    const result = tripInputSchema.parse({
      ...input,
      destination: " Kyoto ",
      preferences: " hello ",
    });
    expect(result.destination).toBe("Kyoto");
    expect(result.preferences).toBe("hello");
  });
  it.each([0, -2, NaN, Infinity, 1.234, 1_000_000_001])(
    "rejects invalid budget %s",
    (budget) => {
      expect(tripInputSchema.safeParse({ ...input, budget }).success).toBe(
        false,
      );
    },
  );
  it("requires interests", () => {
    expect(tripInputSchema.safeParse({ ...input, interests: [] }).success).toBe(
      false,
    );
  });
  it("rejects unsupported currencies and duplicate interests", () => {
    expect(
      tripInputSchema.safeParse({ ...input, currency: "XXX" }).success,
    ).toBe(false);
    expect(
      tripInputSchema.safeParse({ ...input, interests: ["Food", "Food"] })
        .success,
    ).toBe(false);
  });
  it("rejects reversed dates and trips longer than 14 days", () => {
    expect(
      tripInputSchema.safeParse({ ...input, endDate: "2026-11-30" }).success,
    ).toBe(false);
    expect(
      tripInputSchema.safeParse({ ...input, endDate: "2026-12-15" }).success,
    ).toBe(false);
    expect(
      tripInputSchema.safeParse({ ...input, endDate: "2026-12-14" }).success,
    ).toBe(true);
  });
  it.each(["2026-02-30", "2026-13-01", "2026-2-1", "not-a-date"])(
    "rejects impossible or malformed date %s",
    (value) => {
      expect(dateSchema.safeParse(value).success).toBe(false);
    },
  );
  it("counts inclusive days across leap days, months, and daylight savings", () => {
    expect(tripDayCount("2028-02-28", "2028-03-01")).toBe(3);
    expect(tripDayCount("2026-03-07", "2026-03-09")).toBe(3);
    expect(tripDayCount("2026-12-01", "2026-12-01")).toBe(1);
  });
});
describe("mock generation and costs", () => {
  it.each(["relaxed", "moderate", "packed"] as const)(
    "respects %s pace and includes every date",
    (pace) => {
      const trip = generateMockItinerary({ ...input, pace }, id);
      expect(trip.days).toHaveLength(3);
      expect(trip.days[2].date).toBe(input.endDate);
      expect(trip.days[0].activities).toHaveLength(
        pace === "relaxed" ? 2 : pace === "moderate" ? 3 : 4,
      );
      expect(itinerarySchema.safeParse(trip).success).toBe(true);
    },
  );
  it("creates stable unique IDs and preserves notes without claiming to interpret them", () => {
    const trip = generateMockItinerary(input, id);
    const ids = trip.days.flatMap((day) =>
      day.activities.map((activity) => activity.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(trip.input.preferences).toBe(input.preferences);
    expect(
      trip.days.flatMap((day) =>
        day.activities.every((activity) =>
          input.interests.includes(activity.category),
        ),
      ),
    ).not.toContain(false);
  });
  it("computes cost totals from activities", () => {
    const trip = generateMockItinerary(input, id);
    const summary = summarizeCosts(trip);
    expect(summary.total).toBe(824.94);
    expect(summary.remaining).toBe(675.06);
    expect(summary.percent).toBeCloseTo(55, 1);
  });
  it("handles a very small budget without negative or nonfinite costs", () => {
    const summary = summarizeCosts(
      generateMockItinerary({ ...input, budget: 0.01 }, id),
    );
    expect(summary.total).toBe(0);
    expect(summary.remaining).toBe(0.01);
  });
  it("does not exceed the budget from rounding on long, low-budget trips", () => {
    const summary = summarizeCosts(
      generateMockItinerary(
        { ...input, endDate: "2026-12-14", pace: "packed", budget: 0.51 },
        id,
      ),
    );
    expect(summary.total).toBeLessThanOrEqual(0.51);
    expect(summary.remaining).toBeGreaterThanOrEqual(0);
  });
  it("rejects changed dates and duplicate activity IDs at the data boundary", () => {
    const trip = generateMockItinerary(input, id);
    trip.days[1].date = trip.days[0].date;
    expect(itinerarySchema.safeParse(trip).success).toBe(false);
    const duplicate = generateMockItinerary(input, id);
    duplicate.days[1].activities[0].id = duplicate.days[0].activities[0].id;
    expect(itinerarySchema.safeParse(duplicate).success).toBe(false);
  });
});
