import {
  activityLocationSchema,
  coordinatesSchema,
  minimumDurationSchema,
  type ActivityLocation,
} from "./location-schema";
import {
  configuredLocationProviders,
  placeCandidateSchema,
  type LocationProvider,
  type PlaceCandidate,
} from "./location-provider";
import { canonicalJSON } from "./fingerprint";
import {
  placeCatalog,
  PLACE_CATALOG_VERSION,
  type PlaceReference,
} from "./place-catalog";
import type { Activity, Itinerary, TripInput } from "./types";

const normalized = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/\s+/g, " ");
const unknown = (
  reason:
    | "not_found"
    | "wrong_city"
    | "invalid_result"
    | "provider_unavailable" = "not_found",
): ActivityLocation => ({ status: "unresolved", source: "none", reason });

// Compatibility resolver: preserve legacy offline metadata byte-for-byte.
export function selectPlace(
  name: string,
  input: TripInput,
  candidates: readonly PlaceReference[],
): ActivityLocation {
  const city = input.resolvedDestination;
  if (!city || !normalized(name)) return unknown();
  const named = candidates.filter((p) =>
    [p.name, ...p.aliases].some(
      (alias) => normalized(alias) === normalized(name),
    ),
  );
  const local = named.filter(
    (p) => p.cityId === city.id && p.countryCode === city.countryCode,
  );
  if (!local.length) return unknown(named.length ? "wrong_city" : "not_found");
  if (local.length > 1)
    return { status: "ambiguous", source: "none", reason: "ambiguous" };
  const p = local[0];
  if (
    p.kind === "city" ||
    !coordinatesSchema.safeParse({
      latitude: p.latitude,
      longitude: p.longitude,
    }).success
  )
    return unknown("invalid_result");
  if (straightLineKm(city, p) > 80) return unknown("invalid_result");
  return {
    status: "resolved",
    source: "wikidata_offline",
    verification: "reference_matched",
    catalogVersion: PLACE_CATALOG_VERSION,
    placeId: p.id,
    placeName: p.name,
    cityId: city.id,
    precision: p.kind,
    coordinates: { latitude: p.latitude, longitude: p.longitude },
  };
}
export function resolveActivityLocation(
  name: string,
  input: TripInput,
): ActivityLocation {
  return selectPlace(name, input, placeCatalog);
}
export async function resolveWithProvider(
  name: string,
  input: TripInput,
  provider: LocationProvider,
): Promise<ActivityLocation> {
  try {
    return selectProviderPlace(
      name,
      input,
      await provider.search(name, input),
      provider,
    );
  } catch {
    return unknown("provider_unavailable");
  }
}

export function selectProviderPlace(
  name: string,
  input: TripInput,
  raw: readonly unknown[],
  provider: LocationProvider,
): ActivityLocation {
  const city = input.resolvedDestination;
  if (!city || !normalized(name)) return unknown();
  if (raw.length > 10) return unknown("invalid_result");
  const parsed = raw.map((p) => placeCandidateSchema.safeParse(p));
  if (parsed.some((p) => !p.success)) return unknown("invalid_result");
  const named = parsed.flatMap((p) =>
    p.success &&
    [p.data.name, ...p.data.aliases].some(
      (alias) => normalized(alias) === normalized(name),
    )
      ? [p.data]
      : [],
  );
  const local = named.filter(
    (p) => p.cityId === city.id && p.countryCode === city.countryCode,
  );
  if (!local.length) return unknown(named.length ? "wrong_city" : "not_found");
  if (local.length !== 1)
    return { status: "ambiguous", source: "none", reason: "ambiguous" };
  const p = local[0];
  if (
    p.provenance.provider !== provider.namespace ||
    p.kind === "city" ||
    straightLineKm(city, p) > 80
  )
    return unknown("invalid_result");
  // A search response is only a candidate. Identity must also be supported by
  // the configured adapter's trusted evidence, not a browser-supplied flag.
  const reference = placeCandidateSchema.safeParse(
    provider.reference(p.id, p.provenance.datasetVersion),
  );
  if (!reference.success || canonicalJSON(reference.data) !== canonicalJSON(p))
    return unknown("invalid_result");
  return providerLocation(p);
}
function providerLocation(p: PlaceCandidate): ActivityLocation {
  if (p.kind === "city") return unknown("invalid_result");
  return {
    status: "resolved",
    source: "provider_reference",
    verification: "reference_matched",
    placeId: `${p.provenance.provider}:${p.id}`,
    placeName: p.name,
    cityId: p.cityId,
    precision: p.kind,
    coordinates: { latitude: p.latitude, longitude: p.longitude },
    provenance: p.provenance,
  };
}

// The only configured runtime provider is offline Wikidata. Future providers
// supply reference evidence through application-owned adapters, not stored flags.
export function verifiedLocation(
  activity: Pick<Activity, "name"> & Partial<Pick<Activity, "location">>,
  input: TripInput,
  providers: readonly LocationProvider[] = configuredLocationProviders,
) {
  const stored = activityLocationSchema.safeParse(activity.location);
  if (!stored.success || stored.data.status !== "resolved") return null;
  if (stored.data.source === "provider_reference") {
    const location = stored.data;
    const provider = providers.find(
      (p) => p.namespace === location.provenance.provider,
    );
    if (!provider) return null;
    try {
      const reference = provider.reference(
        location.provenance.recordId,
        location.provenance.datasetVersion,
      );
      const expected = selectProviderPlace(
        activity.name,
        input,
        [reference],
        provider,
      );
      return expected.status === "resolved" &&
        canonicalJSON(expected) === canonicalJSON(location)
        ? expected
        : null;
    } catch {
      return null;
    }
  }
  const expected = resolveActivityLocation(activity.name, input);
  if (
    expected.status !== "resolved" ||
    expected.source !== "wikidata_offline" ||
    expected.placeId !== stored.data.placeId ||
    expected.cityId !== stored.data.cityId ||
    expected.catalogVersion !== stored.data.catalogVersion ||
    expected.precision !== stored.data.precision ||
    expected.placeName !== stored.data.placeName ||
    expected.coordinates.latitude !== stored.data.coordinates.latitude ||
    expected.coordinates.longitude !== stored.data.coordinates.longitude
  )
    return null;
  return expected;
}
export function locateActivity<T extends { name: string }>(
  activity: T,
  input: TripInput,
) {
  const { minimumDuration: _untrustedMinimum, ...planned } = activity as T & {
    minimumDuration?: unknown;
  };
  void _untrustedMinimum;
  const location =
    verifiedLocation(
      activity as T & Partial<Pick<Activity, "location">>,
      input,
    ) ?? resolveActivityLocation(activity.name, input);
  const minimum = referenceMinimum(location, configuredLocationProviders);
  return {
    ...planned,
    location,
    ...(minimum ? { minimumDuration: minimum } : {}),
  };
}
export async function locateWithProvider<T extends { name: string }>(
  activity: T,
  input: TripInput,
  provider: LocationProvider,
) {
  const { minimumDuration: _untrustedMinimum, ...planned } = activity as T & {
    minimumDuration?: unknown;
  };
  void _untrustedMinimum;
  const location = await resolveWithProvider(activity.name, input, provider);
  const minimum = referenceMinimum(location, [provider]);
  return {
    ...planned,
    location,
    ...(minimum ? { minimumDuration: minimum } : {}),
  };
}
export const FULL_DAY_MINUTES = 360; // Explicit planning policy, not verified visit duration.
export function durationConcern(
  activity: Pick<Activity, "name" | "durationMinutes"> &
    Partial<Pick<Activity, "location" | "minimumDuration">>,
  input: TripInput,
  providers: readonly LocationProvider[] = configuredLocationProviders,
) {
  const resolved =
    verifiedLocation(activity, input, providers) ??
    resolveActivityLocation(activity.name, input);
  const minimum = referenceMinimum(resolved, providers);
  if (minimum && activity.durationMinutes < minimum.minutes)
    return `The proposed ${activity.durationMinutes}-minute slot is below the independently referenced ${minimum.minutes}-minute minimum. Request a longer visit.`;
  const location = resolveActivityLocation(activity.name, input);
  if (location.status !== "resolved") return null;
  const place = placeCatalog.find((p) => p.id === location.placeId);
  return place?.visitProfile === "full_day" &&
    activity.durationMinutes < FULL_DAY_MINUTES
    ? `${place.name} has a full-day planning profile. The proposed ${activity.durationMinutes}-minute slot is too short under the conservative ${FULL_DAY_MINUTES}-minute planning allowance (not a verified visit duration). Request a longer dedicated visit or clarify the scope; unrelated activities have not been removed.`
    : null;
}
// Independent minimum evidence is separate from planned minutes and heuristic
// allowances. Recheck against a configured source before treating it as a limit.
function referenceMinimum(
  location: ActivityLocation,
  providers: readonly LocationProvider[],
) {
  if (location.status !== "resolved") return null;
  if (location.source === "wikidata_offline")
    return (
      placeCatalog.find((p) => p.id === location.placeId)?.minimumDuration ??
      null
    );
  try {
    const provider = providers.find(
      (p) => p.namespace === location.provenance.provider,
    );
    if (!provider) return null;
    return (
      placeCandidateSchema.parse(
        provider.reference(
          location.provenance.recordId,
          location.provenance.datasetVersion,
        ),
      ).minimumDuration ?? null
    );
  } catch {
    return null;
  }
}
export function evidencedMinimumDuration(
  activity: Pick<Activity, "name"> &
    Partial<Pick<Activity, "location" | "minimumDuration">>,
  input: TripInput,
  providers: readonly LocationProvider[] = configuredLocationProviders,
) {
  const evidence = minimumDurationSchema.safeParse(activity.minimumDuration);
  const location = verifiedLocation(activity, input, providers);
  if (!evidence.success || !location) return null;
  try {
    const expected = referenceMinimum(location, providers);
    return expected && canonicalJSON(expected) === canonicalJSON(evidence.data)
      ? evidence.data
      : null;
  } catch {
    return null;
  }
}
export function referenceContext(input: TripInput) {
  return placeCatalog
    .filter((p) => p.cityId === input.resolvedDestination?.id)
    .map((p) => ({
      name: p.name,
      visitProfile: p.visitProfile ?? "unknown",
      planningAllowanceMinutes:
        p.visitProfile === "full_day" ? FULL_DAY_MINUTES : null,
    }));
}
export function straightLineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const x =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return (
    6371 *
    2 *
    Math.atan2(Math.sqrt(Math.min(1, x)), Math.sqrt(Math.max(0, 1 - x)))
  );
}
export function geographicWarnings(
  day: Itinerary["days"][number],
  input: TripInput,
) {
  return day.activities.slice(1).flatMap((activity, index) => {
    const before = verifiedLocation(day.activities[index], input),
      after = verifiedLocation(activity, input);
    if (!before || !after) return [];
    const distance = straightLineKm(before.coordinates, after.coordinates);
    return distance >= 5
      ? [
          `${before.placeName} to ${after.placeName}: ${distance.toFixed(1)} km straight-line distance. Route, travel time and schedule feasibility are unverified.`,
        ]
      : [];
  });
}
