import "server-only";
import { z } from "zod";
import type { Destination } from "@/features/trips/planning-schema";
import {
  destinationPhotoSchema,
  type DestinationPhoto,
} from "@/features/trips/destination-media";
import {
  photoUsageToken,
  readPhotoUsageToken,
  validDownloadURL,
} from "./photo-usage";

const resultSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.string().regex(/^[\w-]{1,80}$/),
        description: z.string().nullable(),
        alt_description: z.string().nullable(),
        urls: z.object({ regular: z.string() }),
        links: z.object({ html: z.string(), download_location: z.string() }),
        user: z.object({
          name: z.string(),
          links: z.object({ html: z.string() }),
        }),
      }),
    )
    .max(10),
});
type Entry = {
  photo: Omit<DestinationPhoto, "usageToken"> | null;
  download?: string;
  expires: number;
};
const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<Entry>>();
const TTL = 24 * 60 * 60_000;
let budget = { start: 0, used: 0 };
let searchBudget = { start: 0, used: 0 };
const uses = new Map<string, { expires: number; work: Promise<void> }>();
let blockedUntil = 0;
export class PhotoProviderError extends Error {
  constructor(public readonly retryAfter: number) {
    super("Photo provider unavailable");
  }
}
function normalize(text: string) {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
function mentions(text: string, name: string) {
  return ` ${normalize(text)} `.includes(` ${normalize(name)} `);
}
function relevant(caption: string, city: Destination) {
  const countries = [
    city.country,
    new Intl.DisplayNames(["en"], { type: "region" }).of(city.countryCode) ??
      city.country,
  ];
  // Common country abbreviations differ from ISO codes in provider captions.
  if (city.countryCode === "GB")
    countries.push("UK", "U.K.", "Great Britain", "Britain");
  if (city.countryCode === "US") countries.push("USA", "U.S.A.");
  if (city.countryCode === "AE") countries.push("UAE", "U.A.E.");
  return (
    mentions(caption, city.name) &&
    (countries.some((name) => mentions(caption, name)) ||
      caption.split(/[^\p{L}\p{N}]+/u).includes(city.countryCode))
  );
}
function checkProvider(response: Response) {
  if (response.status === 429) {
    const header = response.headers.get("Retry-After");
    const seconds =
      header && /^\d+$/.test(header)
        ? Number(header)
        : header
          ? (Date.parse(header) - Date.now()) / 1000
          : 3600;
    const retry = Number.isFinite(seconds)
      ? Math.min(86400, Math.max(1, Math.ceil(seconds)))
      : 3600;
    blockedUntil = Date.now() + retry * 1000;
    throw new PhotoProviderError(retry);
  }
  if (!response.ok) throw new Error("Photo provider unavailable");
}
function quota(search = false) {
  if (blockedUntil > Date.now())
    throw new PhotoProviderError(Math.ceil((blockedUntil - Date.now()) / 1000));
  if (Date.now() - budget.start >= 3_600_000)
    budget = { start: Date.now(), used: 0 };
  if (budget.used >= 40) throw new Error("Photo quota reached");
  if (Date.now() - searchBudget.start >= 3_600_000)
    searchBudget = { start: Date.now(), used: 0 };
  if (search && searchBudget.used >= 20)
    throw new Error("Photo search quota reached");
  if (search) searchBudget.used++;
  budget.used++;
}
function credited(link: string) {
  const url = new URL(link);
  if (url.protocol !== "https:" || url.hostname !== "unsplash.com")
    throw new Error("Invalid photo attribution");
  url.searchParams.set("utm_source", "tripplannerai");
  url.searchParams.set("utm_medium", "referral");
  return url.toString();
}
export function photoQuery(city: Destination) {
  return [city.name, city.region, city.country, "city skyline travel"]
    .filter(Boolean)
    .join(" ");
}
export async function destinationPhoto(
  city: Destination,
): Promise<DestinationPhoto | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (process.env.DESTINATION_PHOTOS_ENABLED !== "true" || !key) return null;
  const previous = cache.get(city.id);
  const publicPhoto = (entry: Entry) =>
    entry.photo && entry.download
      ? {
          ...entry.photo,
          usageToken: photoUsageToken(entry.photo.photoId, entry.download, key),
        }
      : null;
  if (previous && previous.expires > Date.now()) return publicPhoto(previous);
  let work = pending.get(city.id);
  if (!work) {
    work = (async () => {
      let match: z.infer<typeof resultSchema>["results"][number] | undefined;
      // One broader city/country query only for successful but unsuitable results.
      // Transport errors and rate limits never trigger this fallback or a retry.
      for (const query of [photoQuery(city), `${city.name} ${city.country}`]) {
        quota(true);
        const url = new URL("https://api.unsplash.com/search/photos");
        url.searchParams.set("query", query);
        url.searchParams.set("orientation", "landscape");
        url.searchParams.set("content_filter", "high");
        url.searchParams.set("per_page", "10");
        const response = await fetch(url, {
          headers: {
            Authorization: `Client-ID ${key}`,
            "Accept-Version": "v1",
          },
          signal: AbortSignal.timeout(5000),
          cache: "no-store",
        });
        checkProvider(response);
        const results = resultSchema.parse(await response.json()).results;
        match = results.find((item) =>
          relevant(
            `${item.description ?? ""} ${item.alt_description ?? ""}`,
            city,
          ),
        );
        if (match) break;
      }
      const photo = match
        ? destinationPhotoSchema.omit({ usageToken: true }).parse({
            photoId: match.id,
            cityId: city.id,
            url: match.urls.regular,
            alt: `${city.name}, ${city.country}: ${match.alt_description ?? "city scenery"}`.slice(
              0,
              300,
            ),
            photographer: match.user.name,
            photographerURL: credited(match.user.links.html),
            photoURL: credited(match.links.html),
          })
        : null;
      const download = match?.links.download_location;
      if (download && match) validDownloadURL(download, match.id);
      const entry = {
        photo,
        download,
        expires: Date.now() + (photo ? TTL : 300_000),
      };
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(city.id, entry);
      return entry;
    })();
    pending.set(city.id, work);
  }
  try {
    return publicPhoto(await work);
  } finally {
    if (pending.get(city.id) === work) pending.delete(city.id);
  }
}
// Signed provider identity survives search-cache eviction/server restarts and
// binds tracking to the displayed photo, not whichever result a city has now.
export async function trackDestinationPhoto(token: string, eventId: string) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key || process.env.DESTINATION_PHOTOS_ENABLED !== "true")
    throw new Error("Photo tracking unavailable");
  const payload = readPhotoUsageToken(token, key);
  const id = `${payload.photoId}:${z.uuid().parse(eventId)}`;
  for (const [id, item] of uses) if (item.expires < Date.now()) uses.delete(id);
  const existing = uses.get(id);
  if (existing) return existing.work;
  if (uses.size >= 1000) throw new Error("Photo use capacity reached");
  quota();
  const work = (async () => {
    const response = await fetch(payload.download, {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    checkProvider(response);
  })();
  // Retain failed attempts too: ambiguous transport failures must not retry a
  // possibly delivered event automatically. Separate genuine uses get new IDs.
  uses.set(id, { work, expires: Date.now() + 3_600_000 });
  return work;
}
