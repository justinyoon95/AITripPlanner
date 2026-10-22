import { expect, it } from "vitest";
import {
  resolveActivityLocation,
  selectPlace,
  resolveWithProvider,
  verifiedLocation,
  locateActivity,
  durationConcern,
  geographicWarnings,
  straightLineKm,
} from "@/features/trips/activity-locations";
import {
  activityLocationSchema,
  coordinatesSchema,
} from "@/features/trips/location-schema";
import { placeCatalog } from "@/features/trips/place-catalog";
import { activityMarkers } from "@/features/trips/map-activities";
import { applyEditOperations } from "@/features/trips/edit-engine";
import { normalizeAIItinerary } from "@/lib/ai/itinerary-service";
import { normalizeEditResponse } from "@/lib/ai/edit-service";
import { itinerarySchema } from "@/features/trips/schema";
import {
  createSession,
  acceptProposal,
  invalidateProposal,
  undoVersion,
  restoreVersion,
  validateProposal,
} from "@/features/trips/versioning";
import { editRequest } from "./edit-fixtures";
import { input, previewId, aiFixture } from "./fixtures";
import { generateMockItinerary } from "@/features/trips/mock-generator";
import { validateNewTrip } from "@/lib/validate-trip";
import { travelWindow } from "@/features/trips/travel-planning";

export const osakaInput = {
  ...input,
  destination: "Osaka, Japan",
  resolvedDestination: {
    id: "1853909",
    name: "Osaka",
    region: "Osaka",
    country: "Japan",
    countryCode: "JP",
    latitude: 34.6937,
    longitude: 135.5023,
    timezone: "Asia/Tokyo",
  },
};
function trip() {
  return generateMockItinerary(osakaInput, previewId);
}
it.each([
  "Osaka Castle",
  "Visit Osaka Castle",
  "Universal Studios Japan",
  "USJ",
  "Dōtonbori",
])("resolves exact reference identities: %s", (name) => {
  const resolved = resolveActivityLocation(name, osakaInput);
  expect(resolved.status).toBe("resolved");
  expect(activityLocationSchema.safeParse(resolved).success).toBe(true);
});
it.each(["Museum", "Osaka Castle restaurant", "a fictional place", "Osaka"])(
  "does not guess a marker for %s",
  (name) =>
    expect(resolveActivityLocation(name, osakaInput).status).toBe("unresolved"),
);
it("rejects a correct name in the wrong selected city or country", () => {
  expect(
    resolveActivityLocation("Osaka Castle", {
      ...osakaInput,
      resolvedDestination: { ...osakaInput.resolvedDestination, id: "1850147" },
    }),
  ).toMatchObject({ reason: "wrong_city" });
  expect(
    resolveActivityLocation("Osaka Castle", {
      ...osakaInput,
      resolvedDestination: {
        ...osakaInput.resolvedDestination,
        countryCode: "US",
      },
    }),
  ).toMatchObject({ reason: "wrong_city" });
});
it("leaves legacy trips without trusted city identity unresolved", () =>
  expect(resolveActivityLocation("Osaka Castle", input).status).toBe(
    "unresolved",
  ));
it("does not choose between ambiguous candidates", () =>
  expect(
    selectPlace("Osaka Castle", osakaInput, [
      placeCatalog[0],
      { ...placeCatalog[0], id: "Q999" },
    ]),
  ).toMatchObject({ status: "ambiguous" }));
it.each([
  { kind: "city" as const },
  { latitude: NaN },
  { longitude: 181 },
  { latitude: 0, longitude: 0 },
])("rejects city-level or invalid coordinate candidates %j", (patch) =>
  expect(
    selectPlace("Osaka Castle", osakaInput, [{ ...placeCatalog[0], ...patch }])
      .status,
  ).toBe("unresolved"),
);
it("provider failure preserves a useful unresolved result", async () =>
  expect(
    await resolveWithProvider("Osaka Castle", osakaInput, {
      namespace: "test",
      reference: () => null,
      search: async () => {
        throw Error("private upstream error");
      },
    }),
  ).toEqual({
    status: "unresolved",
    source: "none",
    reason: "provider_unavailable",
  }));
it.each([
  { latitude: 91, longitude: 0 },
  { latitude: 0, longitude: Infinity },
  { latitude: NaN, longitude: 0 },
])("rejects invalid coordinates %j", (coords) =>
  expect(coordinatesSchema.safeParse(coords).success).toBe(false),
);
it("ignores forged stored coordinates, identifiers, stale versions and renamed attractions", () => {
  const t = trip(),
    a = locateActivity(
      { ...t.days[0].activities[0], name: "Osaka Castle" },
      t.input,
    );
  expect(verifiedLocation(a, t.input)).not.toBeNull();
  if (a.location.status !== "resolved") throw Error("expected resolution");
  for (const location of [
    { ...a.location, placeId: "Q123" },
    { ...a.location, catalogVersion: "old" },
    { ...a.location, coordinates: { latitude: 0, longitude: 0 } },
  ])
    expect(verifiedLocation({ ...a, location }, t.input)).toBeNull();
  expect(
    verifiedLocation({ ...a, name: "Unrelated restaurant" }, t.input),
  ).toBeNull();
});
it("uses stable activity IDs for pins and never fills unresolved points with city coordinates", () => {
  const t = trip();
  t.days[0].activities[0] = locateActivity(
    { ...t.days[0].activities[0], name: "Osaka Castle" },
    t.input,
  );
  expect(activityMarkers(t, t.days[0].id).map((p) => p.id)).toEqual([
    t.days[0].activities[0].id,
  ]);
  expect(activityMarkers(t, t.days[1].id)).toEqual([]);
});
it("replacement invalidates the old place while preserving unrelated metadata and IDs", async () => {
  const t = trip();
  const day = t.days[0];
  day.activities[0] = locateActivity(
    { ...day.activities[0], name: "Osaka Castle" },
    t.input,
  );
  const original = structuredClone(t),
    session = createSession(t),
    request = editRequest(session);
  const { id, location: _location, ...draft } = day.activities[0];
  void _location;
  const response = await normalizeEditResponse(
    {
      kind: "proposal",
      message: "Review",
      operations: [
        {
          type: "replace_activity",
          dayId: day.id,
          activityId: id,
          activity: { ...draft, name: "Unknown shop" },
        },
      ],
    },
    request,
    "ai",
  );
  if (response.kind !== "proposal") throw Error("expected draft");
  expect(response.proposal.candidate.days[0].activities[0]).toMatchObject({
    id,
    location: { status: "unresolved" },
    durationSource: "ai_estimate",
  });
  expect(response.proposal.candidate.days[1]).toEqual(original.days[1]);
  expect(t).toEqual(original);
  const pending = { ...session, pendingProposal: response.proposal };
  expect(invalidateProposal(pending).versions).toEqual(session.versions);
  const saved = await acceptProposal(pending, response.proposal.id);
  expect(saved.versions).toHaveLength(2);
  expect(undoVersion(saved).activeVersionId).toBe(session.activeVersionId);
  expect(
    restoreVersion(undoVersion(saved), saved.activeVersionId).activeVersionId,
  ).toBe(saved.activeVersionId);
  expect(JSON.parse(JSON.stringify(saved)).versions[0].itinerary).toEqual(t);
  await expect(validateProposal(saved, response.proposal)).rejects.toThrow();
});
it("rejects duplicate matched places under different aliases", () => {
  const t = trip(),
    day = t.days[0];
  day.activities[0] = locateActivity(
    { ...day.activities[0], name: "Osaka Castle" },
    t.input,
  );
  const { id, ...activity } = day.activities[1];
  expect(() =>
    applyEditOperations(t, [
      {
        type: "replace_activity",
        dayId: day.id,
        activityId: id,
        activity: { ...activity, name: "Visit Osaka Castle" },
      },
    ]),
  ).toThrow(/same reference-matched place/);
});
it("rejects an under-duration full-day replacement and never silently removes unrelated activities", () => {
  const t = trip(),
    before = structuredClone(t),
    d = t.days[0],
    { id, ...a } = d.activities[0];
  expect(() =>
    applyEditOperations(t, [
      {
        type: "replace_activity",
        dayId: d.id,
        activityId: id,
        activity: {
          ...a,
          name: "Universal Studios Japan",
          durationMinutes: 90,
        },
      },
    ]),
  ).toThrow(/full-day planning profile/);
  expect(t).toEqual(before);
  expect(durationConcern({ ...a, name: "Osaka Castle" }, t.input)).toBeNull();
});
it("permits a full-day replacement on a dedicated day and rejects overlap on a crowded day", () => {
  const t = trip(),
    d = t.days[0],
    { id, ...a } = d.activities[0],
    op = {
      type: "replace_activity" as const,
      dayId: d.id,
      activityId: id,
      activity: { ...a, name: "Universal Studios Japan", durationMinutes: 420 },
    };
  expect(() => applyEditOperations(t, [op])).toThrow(/overlapping/);
  d.activities = d.activities.slice(0, 1);
  expect(
    applyEditOperations(t, [op]).days[0].activities[0].durationMinutes,
  ).toBe(420);
});
it("generation assigns provenance without trusting model geographic fields", () => {
  const raw = aiFixture(osakaInput);
  raw.days[0].activities[0].name = "Osaka Castle";
  Object.assign(raw.days[0].activities[0], {
    location: {
      status: "resolved",
      coordinates: { latitude: 0, longitude: 0 },
    },
  });
  const t = normalizeAIItinerary(raw, osakaInput);
  expect(t.days[0].activities[0].durationSource).toBe("ai_estimate");
  expect(
    verifiedLocation(t.days[0].activities[0], t.input)?.coordinates.latitude,
  ).toBeGreaterThan(34);
  raw.days[0].activities[0].name = "Universal Studios Japan";
  expect(() => normalizeAIItinerary(raw, osakaInput)).toThrow(
    /planning profile/,
  );
});
it("legacy snapshots retain absent metadata and exact input while remaining readable", () => {
  const t = trip();
  expect(itinerarySchema.parse(t)).toEqual(t);
  expect(t.days[0].activities[0]).not.toHaveProperty("location");
  expect(t.days[0].activities[0]).not.toHaveProperty("durationSource");
});
it("reports straight-line distance without inventing a route or travel time", () => {
  expect(
    straightLineKm(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
    ),
  ).toBeCloseTo(111.19, 1);
  expect(
    straightLineKm(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
    ),
  ).toBe(0);
  expect(geographicWarnings(trip().days[0], osakaInput)).toEqual([]);
  const t = trip();
  t.days[0].activities[0] = locateActivity(
    { ...t.days[0].activities[0], name: "Universal Studios Japan" },
    t.input,
  );
  t.days[0].activities[1] = locateActivity(
    { ...t.days[0].activities[1], name: "Osaka Castle" },
    t.input,
  );
  expect(geographicWarnings(t.days[0], t.input)[0]).toMatch(
    /km straight-line distance.*unverified/,
  );
});
it("new location metadata cannot bypass flight buffers, empty travel days or actual hotel movements", () => {
  const value = validateNewTrip({
    ...osakaInput,
    travel: {
      arrival: {
        date: osakaInput.startDate,
        time: "20:30",
        airportCode: "KIX",
      },
      departure: {
        date: osakaInput.endDate,
        time: "09:00",
        airportCode: "KIX",
      },
      accommodation: { checkInAvailableFrom: "15:00", checkOutBy: "11:00" },
    },
  });
  const t = generateMockItinerary(value, previewId),
    day = t.days[0],
    activity = {
      ...trip().days[0].activities[0],
      name: "Osaka Castle",
      time: "21:00",
    };
  expect(day.activities).toEqual([]);
  expect(travelWindow(value, day.date).appointments).toEqual([]);
  expect(() =>
    applyEditOperations(t, [
      {
        type: "add_activity",
        dayId: day.id,
        activity: locateActivity(
          { ...activity, id: "00000000-0000-4000-8000-000000000010" },
          value,
        ),
      },
    ]),
  ).toThrow(/travel/);
  const hotelTrip = trip();
  hotelTrip.input.travel = {
    accommodation: {
      plannedHotelArrivalDate: hotelTrip.input.startDate,
      plannedHotelArrivalTime: "17:00",
    },
  };
  const hday = hotelTrip.days[0];
  expect(() =>
    applyEditOperations(hotelTrip, [
      {
        type: "reschedule_activity",
        dayId: hday.id,
        activityId: hday.activities[0].id,
        time: "17:00",
        durationMinutes: 90,
      },
    ]),
  ).toThrow(/accommodation/);
});
