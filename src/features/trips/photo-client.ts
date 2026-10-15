import {
  destinationPhotoSchema,
  type DestinationPhoto,
} from "./destination-media";
import type { Destination } from "./planning-schema";
const cache = new Map<
  string,
  { expires: number; value: Promise<DestinationPhoto | null> }
>();
export function requestDestinationPhoto(city: Destination) {
  const existing = cache.get(city.id);
  if (existing && existing.expires > Date.now()) return existing.value;
  const query = new URLSearchParams({
    id: city.id,
    q: [city.name, city.region, city.country].filter(Boolean).join(", "),
  });
  let failureTTL = 30_000;
  const value = fetch(`/api/destination-photo?${query}`, {
    cache: "no-store",
  }).then(async (response) => {
    if (response.status === 429) {
      const retry = Number(response.headers.get("Retry-After"));
      failureTTL =
        Number.isFinite(retry) && retry > 0
          ? Math.min(retry, 86400) * 1000
          : 3_600_000;
    }
    if (!response.ok) throw new Error("Photo unavailable");
    const body = await response.json();
    const photo =
      body.photo === null ? null : destinationPhotoSchema.parse(body.photo);
    if (photo && photo.cityId !== city.id)
      throw new Error("Photo destination mismatch");
    return photo;
  });
  if (cache.size >= 50) cache.delete(cache.keys().next().value!);
  cache.set(city.id, { expires: Date.now() + 300_000, value });
  // Short negative cache prevents repeated failures from hammering the service.
  void value.catch(() => {
    if (cache.get(city.id)?.value === value)
      cache.set(city.id, { expires: Date.now() + failureTTL, value });
  });
  return value;
}
