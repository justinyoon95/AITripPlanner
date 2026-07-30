import { TravelStyle, type Trip } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { generateDemoItineraryForTrip } from "@/lib/ai/demo-itinerary-generator";
import { generatedItinerarySchema } from "@/lib/ai/itinerary-schema";

const trip: Trip = {
  id: "trip_1",
  userId: "user_1",
  destination: "Seoul",
  startDate: new Date("2026-08-01"),
  endDate: new Date("2026-08-03"),
  budgetCents: 250000,
  currency: "USD",
  interests: ["food", "culture"],
  travelStyle: TravelStyle.CULTURE,
  createdAt: new Date("2026-07-30"),
  updatedAt: new Date("2026-07-30"),
};

describe("demo itinerary generator", () => {
  it("creates schema-valid demo itineraries", () => {
    const result = generateDemoItineraryForTrip(trip);

    expect(generatedItinerarySchema.safeParse(result.itinerary).success).toBe(
      true,
    );
    expect(result.model).toBe("demo-itinerary-generator");
  });

  it("creates one day per trip day", () => {
    const result = generateDemoItineraryForTrip(trip);

    expect(result.itinerary.days).toHaveLength(3);
  });
});
