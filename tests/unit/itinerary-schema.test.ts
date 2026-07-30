import { describe, expect, it } from "vitest";

import {
  generatedItinerarySchema,
  validateGeneratedItineraryForTrip,
} from "@/lib/ai/itinerary-schema";

const validItinerary = {
  totalEstimatedCostCents: 9000,
  days: [
    {
      dayNumber: 1,
      date: "2026-07-01",
      summary: "Arrival and neighborhood exploration",
      estimatedCostCents: 9000,
      activities: [
        {
          timeBlock: "MORNING",
          name: "Cafe breakfast",
          description: "Start with a local cafe.",
          estimatedCostCents: 2000,
          reason: "Matches the food interest.",
          category: "Food",
          locationHint: "Central area",
          sortOrder: 1,
        },
        {
          timeBlock: "AFTERNOON",
          name: "Museum visit",
          description: "Visit a major museum.",
          estimatedCostCents: 4000,
          reason: "Fits the culture style.",
          category: "Culture",
          locationHint: null,
          sortOrder: 2,
        },
        {
          timeBlock: "EVENING",
          name: "Night market",
          description: "Explore street food stalls.",
          estimatedCostCents: 3000,
          reason: "Good evening food option.",
          category: "Food",
          locationHint: "Market district",
          sortOrder: 3,
        },
      ],
    },
  ],
};

describe("generated itinerary schema", () => {
  it("accepts a valid structured itinerary", () => {
    expect(generatedItinerarySchema.safeParse(validItinerary).success).toBe(
      true,
    );
  });

  it("rejects a day without all three time blocks", () => {
    const itinerary = generatedItinerarySchema.parse({
      ...validItinerary,
      days: [
        {
          ...validItinerary.days[0],
          activities: validItinerary.days[0].activities.map((activity) => ({
            ...activity,
            timeBlock: "MORNING",
          })),
        },
      ],
    });

    expect(() =>
      validateGeneratedItineraryForTrip(itinerary, {
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-07-01"),
      }),
    ).toThrow("must include all three time blocks");
  });
});
