import "server-only";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import {
  destinationSchema,
  airportSchema,
  type Destination,
  type Airport,
} from "@/features/trips/planning-schema";
import { GenerationError } from "./ai/errors";

type CityRecord = Destination & { aliases: string[]; population: number };
const normalize = (text: string) =>
  text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
let cities: (CityRecord & { names: string[] })[] | undefined;
let airports: Map<string, Airport> | undefined;
function load() {
  if (cities && airports) return;
  try {
    const cityData = JSON.parse(
      gunzipSync(
        readFileSync(path.join(process.cwd(), "data/geography/cities.json.gz")),
      ).toString(),
    ) as CityRecord[];
    const airportData = JSON.parse(
      gunzipSync(
        readFileSync(
          path.join(process.cwd(), "data/geography/airports.json.gz"),
        ),
      ).toString(),
    ) as Airport[];
    cities = cityData.map((city) => ({
      ...city,
      names: [...new Set([city.name, ...city.aliases].map(normalize))],
    }));
    airports = new Map(airportData.map((airport) => [airport.code, airport]));
  } catch {
    cities = undefined;
    airports = undefined;
    throw new GenerationError(
      "GEOGRAPHY_UNAVAILABLE",
      "Geographic reference data is unavailable. Please retry; no AI request was made.",
      503,
    );
  }
}
export const cityLabel = (city: Destination) =>
  [city.name, city.region, city.country].filter(Boolean).join(", ");
function matches(
  city: CityRecord & { names: string[] },
  parts: string[],
  prefix: boolean,
) {
  return (
    city.names.some((name) =>
      prefix ? name.startsWith(parts[0]) : name === parts[0],
    ) &&
    parts
      .slice(1)
      .every((part) =>
        [city.region, city.country, city.countryCode].some(
          (value) => normalize(value) === part,
        ),
      )
  );
}
export function searchCities(query: string) {
  load();
  const parts = query.split(",").map(normalize);
  if (parts[0].length < 2) return [];
  const relevance = (city: CityRecord & { names: string[] }) => {
    const name = normalize(city.name);
    return name === parts[0] && parts[0].length >= 4
      ? 3
      : name.startsWith(parts[0])
        ? 2
        : city.names.includes(parts[0])
          ? 1
          : 0;
  };
  return cities!
    .filter((city) => matches(city, parts, true))
    .sort((a, b) => relevance(b) - relevance(a) || b.population - a.population)
    .slice(0, 10)
    .map((city) => destinationSchema.parse(cityWithoutIndex(city)));
}
function cityWithoutIndex(city: CityRecord) {
  const { aliases: _aliases, population: _population, ...value } = city;
  void _aliases;
  void _population;
  const { names: _names, ...rest } = value as typeof value & {
    names?: string[];
  };
  void _names;
  return rest;
}
export function resolveCity(query: string, id?: string): Destination {
  load();
  const parts = query.split(",").map(normalize);
  const matchesByName = cities!.filter((city) => matches(city, parts, false));
  const primary = matchesByName.filter(
    (city) => normalize(city.name) === parts[0],
  );
  const candidates = primary.length ? primary : matchesByName;
  const selected = id
    ? candidates.find((city) => city.id === id)
    : candidates.length === 1
      ? candidates[0]
      : undefined;
  if (!selected)
    throw new GenerationError(
      "INVALID_DESTINATION",
      candidates.length > 1
        ? "Several cities match. Select a city, region and country from the suggestions."
        : "Select a recognized city from the destination suggestions.",
      400,
    );
  return destinationSchema.parse(cityWithoutIndex(selected));
}
export function resolveAirport(code: string): Airport {
  load();
  const airport = airports!.get(code);
  if (!airport)
    throw new GenerationError(
      "INVALID_AIRPORT",
      `Airport code ${code} is not in the supported reference data. Use a recognized three-letter IATA code.`,
      400,
    );
  return airportSchema.parse(airport);
}
