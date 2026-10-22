import type { Itinerary } from "./types";
import { verifiedLocation } from "./activity-locations";
import {
  configuredLocationProviders,
  type LocationProvider,
} from "./location-provider";

export type ActivityMarker = {
  id: string;
  name: string;
  dayNumber: number;
  coordinates: { latitude: number; longitude: number };
};
export function activityMarkers(
  itinerary: Itinerary,
  dayId: string,
  providers: readonly LocationProvider[] = configuredLocationProviders,
): ActivityMarker[] {
  return (
    itinerary.days.find((day) => day.id === dayId)?.activities ?? []
  ).flatMap((activity) => {
    const location = verifiedLocation(activity, itinerary.input, providers);
    return location
      ? [
          {
            id: activity.id,
            name: activity.name,
            dayNumber: itinerary.days.find((day) => day.id === dayId)!.number,
            coordinates: location.coordinates,
          },
        ]
      : [];
  });
}
