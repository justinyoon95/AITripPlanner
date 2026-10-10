import { activityTemplates } from "./mock-data";
import {
  DAY_MS,
  itinerarySchema,
  tripDayCount,
  tripInputSchema,
} from "./schema";
import type { Itinerary, TripInput } from "./types";

export function generateMockItinerary(
  rawInput: TripInput,
  id: string,
  now = new Date(),
): Itinerary {
  const input = tripInputSchema.parse(rawInput);
  const count = tripDayCount(input.startDate, input.endDate);
  const slots =
    input.pace === "relaxed"
      ? ["10:00", "16:00"]
      : input.pace === "moderate"
        ? ["09:00", "13:00", "18:00"]
        : ["09:00", "12:00", "15:00", "19:00"];
  const activityBudget = (input.budget * 0.55) / (count * slots.length);
  const days = Array.from({ length: count }, (_, dayIndex) => ({
    number: dayIndex + 1,
    date: new Date(
      Date.parse(`${input.startDate}T00:00:00Z`) + dayIndex * DAY_MS,
    )
      .toISOString()
      .slice(0, 10),
    title: [
      "Get to know the city",
      "Follow your curiosity",
      "A little off the beaten path",
      "Make it your own",
    ][dayIndex % 4],
    activities: slots.map((time, slotIndex) => {
      const index = dayIndex * slots.length + slotIndex;
      const evening = Number(time.slice(0, 2)) >= 18;
      const daytimeInterests = input.interests.filter(
        (interest) => interest !== "Nightlife",
      );
      const pool =
        !evening && daytimeInterests.length
          ? daytimeInterests
          : input.interests;
      const category =
        evening && input.interests.includes("Nightlife")
          ? "Nightlife"
          : pool[index % pool.length];
      const templates = activityTemplates[category];
      const template =
        templates[Math.floor(index / pool.length) % templates.length];
      return {
        ...template,
        category,
        id: `${id}-day${dayIndex + 1}-slot${slotIndex + 1}`,
        time,
        estimatedCost:
          Math.floor(activityBudget * (category === "Nature" ? 0.3 : 1) * 100) /
          100,
      };
    }),
  }));
  return itinerarySchema.parse({
    id,
    source: "mock",
    createdAt: now.toISOString(),
    input,
    days,
  });
}

export function summarizeCosts(itinerary: Itinerary) {
  const total =
    Math.round(
      itinerary.days.reduce(
        (sum, day) =>
          sum +
          day.activities.reduce(
            (subtotal, activity) => subtotal + activity.estimatedCost,
            0,
          ),
        0,
      ) * 100,
    ) / 100;
  return {
    total,
    remaining: Math.round((itinerary.input.budget - total) * 100) / 100,
    percent: (total / itinerary.input.budget) * 100,
  };
}
