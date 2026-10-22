"use client";
import { useMemo } from "react";
import type { Itinerary } from "@/features/trips/types";
import { activityMarkers } from "@/features/trips/map-activities";
import {
  geographicWarnings,
  verifiedLocation,
} from "@/features/trips/activity-locations";
import { DestinationMap } from "./destination-map";

export function ItineraryMap({
  itinerary,
  dayId,
  selectedActivityId,
  onDayChange,
  onSelectActivity,
}: {
  itinerary: Itinerary;
  dayId: string;
  selectedActivityId: string | null;
  onDayChange: (id: string) => void;
  onSelectActivity: (id: string) => void;
}) {
  const day = itinerary.days.find((d) => d.id === dayId) ?? itinerary.days[0];
  const markers = useMemo(
    () => activityMarkers(itinerary, day.id),
    [itinerary, day.id],
  );
  const selected = day.activities.find((a) => a.id === selectedActivityId);
  const location = selected
    ? verifiedLocation(selected, itinerary.input)
    : null;
  return (
    <section
      className="itinerary-location-panel"
      id="itinerary-map"
      aria-label="Itinerary locations"
    >
      <div className="itinerary-map-controls">
        <h2>Activity locations</h2>
        <label htmlFor="map-day">Day</label>
        <select
          id="map-day"
          value={day.id}
          onChange={(e) => onDayChange(e.target.value)}
        >
          {itinerary.days.map((d) => (
            <option value={d.id} key={d.id}>
              Day {d.number}
            </option>
          ))}
        </select>
      </div>
      <DestinationMap
        destination={itinerary.input.resolvedDestination}
        activities={markers}
        selectedActivityId={selectedActivityId}
        onSelectActivity={onSelectActivity}
        selectionDetails={
          selected
            ? { name: selected.name, description: selected.description }
            : undefined
        }
      />
      <p className="field-hint">
        {markers.length} of {day.activities.length} locations matched to
        reference data. Pins are reference points, not verified entrances or
        routes.
      </p>
      {selected && (
        <div className="map-activity-detail" role="status">
          <strong>{selected.name}</strong>
          <p>{selected.description}</p>
          <p>
            {selected.time} · {selected.durationMinutes} min (
            {selected.durationSource === "user_provided"
              ? "user-provided"
              : selected.durationSource === "ai_estimate"
                ? "AI estimate"
                : "duration source unknown"}
            )
          </p>
          {location && (
            <a
              href={
                location.source === "wikidata_offline"
                  ? `https://www.wikidata.org/wiki/${location.placeId}`
                  : location.provenance.referenceUrl
              }
              target="_blank"
              rel="noreferrer"
            >
              {location.source === "wikidata_offline"
                ? "Wikidata reference"
                : `${location.provenance.provider} reference`}{" "}
              ·{" "}
              {location.precision === "district"
                ? "district reference point"
                : "place reference point"}
            </a>
          )}
          {location?.source === "provider_reference" &&
            location.provenance.attribution.map((credit) => (
              <a
                key={credit.url}
                href={credit.url}
                target="_blank"
                rel="noreferrer"
              >
                {credit.label}
              </a>
            ))}
        </div>
      )}
      {day.activities.some((a) => !verifiedLocation(a, itinerary.input)) && (
        <ul
          className="unresolved-locations"
          aria-label="Unresolved activity locations"
        >
          {day.activities
            .filter((a) => !verifiedLocation(a, itinerary.input))
            .map((a) => (
              <li key={a.id}>
                {a.name} ·{" "}
                {a.location?.status === "ambiguous"
                  ? "Ambiguous location"
                  : "Location unresolved"}
              </li>
            ))}
        </ul>
      )}
      {geographicWarnings(day, itinerary.input).map((w) => (
        <p className="field-hint" key={w}>
          {w}
        </p>
      ))}
    </section>
  );
}
