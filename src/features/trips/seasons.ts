import type { TripInput } from "./types";
import { addDays, tripDayCount } from "./calendar";
export function seasonalContext(input: TripInput) {
  if (input.seasonalPreference === "exclude")
    return {
      preference: "exclude",
      guidance: "Do not specifically add seasonal experiences.",
    };
  const month = Number(input.startDate.slice(5, 7));
  const months = new Set(
    Array.from(
      { length: tripDayCount(input.startDate, input.endDate) },
      (_, index) => Number(addDays(input.startDate, index).slice(5, 7)),
    ),
  );
  const country = input.resolvedDestination?.countryCode;
  const suggestions: string[] = [];
  if (country === "JP" && (months.has(3) || months.has(4)))
    suggestions.push(
      "Consider blossom-viewing in suitable areas; blooming conditions vary by region and year, and no forecast is verified.",
    );
  if (
    ["AT", "DE"].includes(country ?? "") &&
    (months.has(11) || months.has(12))
  )
    suggestions.push(
      "Seasonal markets may be relevant where locally celebrated; current market schedules, locations and availability are not verified.",
    );
  if (country === "KR" && (months.has(10) || months.has(11)))
    suggestions.push(
      "Consider autumn foliage where conditions suit the trip; timing and weather vary.",
    );
  if (country === "US" && months.has(12))
    suggestions.push(
      "Consider local festive displays where relevant to the destination and interests; do not presume uniform holiday observance or confirmed event schedules.",
    );
  const south = (input.resolvedDestination?.latitude ?? 0) < 0;
  const northern =
    month >= 3 && month <= 5
      ? "spring"
      : month >= 6 && month <= 8
        ? "summer"
        : month >= 9 && month <= 11
          ? "autumn"
          : "winter";
  const season = south
    ? (
        {
          spring: "autumn",
          summer: "winter",
          autumn: "spring",
          winter: "summer",
        } as const
      )[northern]
    : northern;
  return {
    preference: input.seasonalPreference ?? "include",
    countryCode: input.resolvedDestination?.countryCode ?? null,
    broadSeason: season,
    suggestions,
    dates: [input.startDate, input.endDate],
    guidance:
      "Broad meteorological seasons only; tropical/local climate may differ. Consider destination-specific culture and user interests. No verified holiday calendar, blossom forecast or festival dates are supplied.",
  };
}
