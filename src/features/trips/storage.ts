import { itinerarySchema } from "./schema";
import type { Itinerary } from "./types";
const PREFIX = "trip-planner:preview:v1:";

export function storePreview(itinerary: Itinerary) {
  const parsed = itinerarySchema.parse(itinerary);
  try {
    window.localStorage.setItem(
      `${PREFIX}${parsed.id}`,
      JSON.stringify(parsed),
    );
  } catch {
    throw new Error(
      "Your browser could not store this preview. Enable site storage or free up space, then try again.",
    );
  }
}
export function readPreview(id: string): Itinerary | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(`${PREFIX}${id}`);
  } catch {
    throw new Error(
      "Your browser could not access this preview. Enable site storage and try again.",
    );
  }
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("This preview is damaged. Please create a new trip.");
  }
  const result = itinerarySchema.safeParse(data);
  if (!result.success || result.data.id !== id)
    throw new Error(
      "This preview is damaged or from an older version. Please create a new trip.",
    );
  return result.data;
}
