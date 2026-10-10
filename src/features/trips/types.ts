import type { z } from "zod";
import type {
  activitySchema,
  itinerarySchema,
  tripInputSchema,
} from "./schema";
export type TripInput = z.infer<typeof tripInputSchema>;
export type Itinerary = z.infer<typeof itinerarySchema>;
export type Activity = z.infer<typeof activitySchema>;
export type Interest = TripInput["interests"][number];
export type ItineraryDay = Itinerary["days"][number];
