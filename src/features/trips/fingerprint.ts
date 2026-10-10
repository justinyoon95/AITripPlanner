import { itinerarySchema } from "./schema";
import type { Itinerary } from "./types";

export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJSON(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
export async function itineraryFingerprint(itinerary: Itinerary) {
  const data = new TextEncoder().encode(
    canonicalJSON(itinerarySchema.parse(itinerary)),
  );
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
