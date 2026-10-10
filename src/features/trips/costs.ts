import type { Itinerary, ItineraryDay } from "./types";

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function summarizeDayCosts(day: ItineraryDay) {
  const activities = roundMoney(
    day.activities.reduce((sum, activity) => sum + activity.estimatedCost, 0),
  );
  const accommodation = day.additionalCosts?.accommodation ?? 0;
  const localTransport = day.additionalCosts?.localTransport ?? 0;
  const additionalMeals = day.additionalCosts?.additionalMeals ?? 0;
  return {
    activities,
    accommodation,
    localTransport,
    additionalMeals,
    total: roundMoney(
      activities + accommodation + localTransport + additionalMeals,
    ),
  };
}

export function summarizeCosts(itinerary: Itinerary) {
  const days = itinerary.days.map(summarizeDayCosts);
  const total = roundMoney(days.reduce((sum, day) => sum + day.total, 0));
  const activities = roundMoney(
    days.reduce((sum, day) => sum + day.activities, 0),
  );
  return {
    total,
    activities,
    remaining: roundMoney(itinerary.input.budget - total),
    percent: (total / itinerary.input.budget) * 100,
  };
}
