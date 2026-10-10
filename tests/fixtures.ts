import { generateMockItinerary } from "@/features/trips/mock-generator";
import type { TripInput } from "@/features/trips/types";

export const input: TripInput = {
  destination: "Kyoto, Japan",
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  budget: 1500,
  currency: "USD",
  interests: ["Food", "Culture"],
  pace: "moderate",
  preferences: "Vegetarian meals",
};
export const previewId = "c4b8cdaa-c4ea-425a-ad32-ea6f4b746057";
export function aiFixture(tripInput = input) {
  const mock = generateMockItinerary(tripInput, previewId);
  return {
    overview: "A balanced visit to Kyoto with food and cultural experiences.",
    assumptions: ["One traveler; excludes travel to and from Kyoto."],
    warnings: ["Verify opening hours and all prices before booking."],
    budgetAssessment: {
      status: "reasonable" as const,
      explanation: "Estimated destination costs fit this budget.",
    },
    days: mock.days.map((day, index) => ({
      number: day.number,
      date: day.date,
      title: day.title,
      additionalCosts: {
        accommodation: index === mock.days.length - 1 ? 0 : 80,
        localTransport: 10,
        additionalMeals: 15,
      },
      activities: day.activities.map(
        ({ name, description, category, time, durationMinutes }) => ({
          name,
          description,
          category,
          time,
          durationMinutes,
          estimatedCost: 10,
        }),
      ),
    })),
  };
}
