import type { TravelStyle } from "@prisma/client";

export const travelStyleLabels: Record<TravelStyle, string> = {
  RELAXED: "Relaxed",
  ADVENTURE: "Adventure",
  CULTURE: "Culture",
  FOODIE: "Foodie",
  NIGHTLIFE: "Nightlife",
  FAMILY: "Family",
  LUXURY: "Luxury",
  BUDGET: "Budget",
};

export function formatTravelStyle(style: TravelStyle) {
  return travelStyleLabels[style];
}
