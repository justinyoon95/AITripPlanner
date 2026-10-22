import type { MinimumDuration } from "./location-schema";
// Small CC0 reference snapshot, not global geocoding or live venue verification.
// Coordinates are transcribed from Wikidata P625; see docs/PHASE4.md.
export const PLACE_CATALOG_VERSION = "wikidata-osaka-2026-10-21-v1";
export type PlaceReference = {
  id: string;
  name: string;
  aliases: readonly string[];
  cityId: string;
  countryCode: string;
  kind: "poi" | "district" | "city";
  latitude: number;
  longitude: number;
  visitProfile?: "full_day";
  minimumDuration?: MinimumDuration;
};
export const placeCatalog: readonly PlaceReference[] = [
  {
    id: "Q321242",
    name: "Osaka Castle",
    aliases: ["Osaka Castle visit", "Visit Osaka Castle"],
    cityId: "1853909",
    countryCode: "JP",
    kind: "poi",
    latitude: 34 + 41 / 60 + 14 / 3600,
    longitude: 135 + 31 / 60 + 33 / 3600,
  },
  {
    id: "Q1375103",
    name: "Universal Studios Japan",
    aliases: [
      "USJ",
      "Visit Universal Studios Japan",
      "Universal Studios Japan visit",
    ],
    cityId: "1853909",
    countryCode: "JP",
    kind: "poi",
    latitude: 34 + 39 / 60 + 36 / 3600,
    longitude: 135 + 25 / 60 + 48 / 3600,
    visitProfile: "full_day",
  },
  {
    id: "Q964876",
    name: "Dotonbori",
    aliases: ["Dōtonbori", "Evening visit to Dotonbori", "Visit Dotonbori"],
    cityId: "1853909",
    countryCode: "JP",
    kind: "district",
    latitude: 34 + 40 / 60 + 7 / 3600,
    longitude: 135 + 30 / 60 + 5 / 3600,
  },
];
