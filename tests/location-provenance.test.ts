import { describe, expect, it, vi } from "vitest";
import {
  resolveWithProvider,
  locateWithProvider,
  selectProviderPlace,
  verifiedLocation,
  evidencedMinimumDuration,
  durationConcern,
  locateActivity,
  referenceContext,
} from "@/features/trips/activity-locations";
import {
  activityLocationSchema,
  minimumDurationSchema,
} from "@/features/trips/location-schema";
import {
  type LocationProvider,
  type PlaceCandidate,
  configuredLocationProviders,
} from "@/features/trips/location-provider";
import { activityMarkers } from "@/features/trips/map-activities";
import { applyEditOperations } from "@/features/trips/edit-engine";
import { itinerarySchema } from "@/features/trips/schema";
import { generateMockItinerary } from "@/features/trips/mock-generator";
import {
  createSession,
  acceptProposal,
  undoVersion,
  restoreVersion,
} from "@/features/trips/versioning";
import { normalizeEditResponse } from "@/lib/ai/edit-service";
import { aiEditOutputSchema } from "@/lib/ai/edit-output-schema";
import { editRequest } from "./edit-fixtures";
import { input, previewId } from "./fixtures";

const tripInput = {
  ...input,
  resolvedDestination: {
    id: "1853909",
    name: "Osaka",
    region: "Osaka",
    country: "Japan",
    countryCode: "JP",
    latitude: 34.69,
    longitude: 135.5,
    timezone: "Asia/Tokyo",
  },
};
// Synthetic provider evidence, never a claim about a real venue or service.
const candidate: PlaceCandidate = {
  id: "attraction-1",
  name: "Test Pavilion",
  aliases: ["Visit Test Pavilion"],
  cityId: "1853909",
  countryCode: "JP",
  kind: "poi",
  latitude: 34.7,
  longitude: 135.51,
  provenance: {
    provider: "test_provider",
    recordId: "attraction-1",
    datasetVersion: "fixture-v1",
    referenceUrl: "https://example.com/attraction-1",
    attribution: [{ label: "Test data", url: "https://example.com/license" }],
  },
};
function provider(record = candidate): LocationProvider {
  return {
    namespace: "test_provider",
    search: vi.fn(async () => [record]),
    reference: vi.fn((id, version) =>
      id === record.id && version === record.provenance.datasetVersion
        ? record
        : null,
    ),
  };
}
const trip = () => generateMockItinerary(tripInput, previewId);

it("no live provider is enabled", () =>
  expect(configuredLocationProviders).toEqual([]));
it("supports namespaced references outside the bundled catalog and checks them without network reads", async () => {
  const adapter = provider(),
    t = trip();
  const a = await locateWithProvider(
    { ...t.days[0].activities[0], name: candidate.name },
    t.input,
    adapter,
  );
  expect(a.location).toMatchObject({
    source: "provider_reference",
    placeId: "test_provider:attraction-1",
    provenance: candidate.provenance,
  });
  expect(activityLocationSchema.safeParse(a.location).success).toBe(true);
  t.days[0].activities[0] = a;
  expect(activityMarkers(t, t.days[0].id, [adapter])).toHaveLength(1);
  expect(verifiedLocation(a, t.input, [adapter])).not.toBeNull();
  expect(adapter.search).toHaveBeenCalledOnce();
  expect(verifiedLocation(a, t.input)).toBeNull();
});
it("cannot authorize a provider by submitting a resolved flag or arbitrary evidence", async () => {
  const adapter = provider(),
    location = await resolveWithProvider(candidate.name, tripInput, adapter);
  const activity = {
    ...trip().days[0].activities[0],
    name: candidate.name,
    location,
  };
  expect(
    verifiedLocation(activity, tripInput, [
      { ...adapter, reference: () => null },
    ]),
  ).toBeNull();
  expect(
    verifiedLocation({ ...activity, name: "Another place" }, tripInput, [
      adapter,
    ]),
  ).toBeNull();
  for (const patch of [
    { placeId: "other:attraction-1" },
    { coordinates: { latitude: 0, longitude: 0 } },
    { provenance: { ...candidate.provenance, datasetVersion: "stale" } },
  ]) {
    expect(
      verifiedLocation(
        { ...activity, location: { ...location, ...patch } } as typeof activity,
        tripInput,
        [adapter],
      ),
    ).toBeNull();
  }
});
it.each([
  { kind: "city" },
  { latitude: NaN },
  { longitude: 181 },
  { countryCode: "US" },
  { cityId: "other" },
  { name: "Test Pavilion restaurant" },
  { latitude: 0, longitude: 0 },
])("rejects invalid or nonmatching provider candidates: %j", async (patch) => {
  const adapter = provider({ ...candidate, ...patch } as PlaceCandidate);
  expect(
    (await resolveWithProvider(candidate.name, tripInput, adapter)).status,
  ).toBe("unresolved");
});
it("rejects ambiguous records, untrusted search results, and provider exceptions", async () => {
  const adapter = provider();
  expect(
    selectProviderPlace(
      candidate.name,
      tripInput,
      [candidate, candidate],
      adapter,
    ).status,
  ).toBe("ambiguous");
  expect(
    selectProviderPlace(candidate.name, tripInput, [candidate], {
      ...adapter,
      namespace: "other",
    }).status,
  ).toBe("unresolved");
  expect(
    selectProviderPlace(candidate.name, tripInput, [candidate], {
      ...adapter,
      reference: () => ({ ...candidate, latitude: 34.71 }),
    }).status,
  ).toBe("unresolved");
  expect(
    (
      await resolveWithProvider(candidate.name, tripInput, {
        ...adapter,
        search: async () => {
          throw Error("private");
        },
      })
    ).status,
  ).toBe("unresolved");
});
it.each([
  "javascript:alert(1)",
  "http://example.com",
  "https://user:password@example.com",
])("rejects unsafe provenance links: %s", async (url) => {
  const adapter = provider({
    ...candidate,
    provenance: { ...candidate.provenance, referenceUrl: url },
  });
  expect(
    (await resolveWithProvider(candidate.name, tripInput, adapter)).status,
  ).toBe("unresolved");
});
it("legacy offline records parse unchanged and still produce markers", () => {
  const t = trip(),
    activity = locateActivity(
      { ...t.days[0].activities[0], name: "Osaka Castle" },
      t.input,
    );
  t.days[0].activities[0] = activity;
  expect(activityLocationSchema.parse(activity.location)).toEqual(
    activity.location,
  );
  expect(itinerarySchema.parse(t)).toEqual(t);
  expect(activityMarkers(t, t.days[0].id)).toHaveLength(1);
  expect(activity).not.toHaveProperty("minimumDuration");
});

describe("duration provenance and independent evidence", () => {
  it.each(["user_provided", "ai_estimate", "unknown", undefined] as const)(
    "preserves unchanged duration provenance: %s",
    (source) => {
      const t = trip(),
        day = t.days[0];
      if (source) day.activities[0].durationSource = source;
      const before = structuredClone(t),
        a = day.activities[0];
      const next = applyEditOperations(t, [
        {
          type: "reschedule_activity",
          dayId: day.id,
          activityId: a.id,
          time: "08:00",
          durationMinutes: a.durationMinutes,
        },
      ]);
      expect(next.days[0].activities[0].durationSource).toBe(source);
      expect(next.days[1]).toEqual(t.days[1]);
      expect(t).toEqual(before);
    },
  );
  it("a changed AI-proposed duration is an estimate, not user-provided", () => {
    const t = trip(),
      d = t.days[0],
      a = d.activities[0];
    a.durationSource = "user_provided";
    const next = applyEditOperations(t, [
      {
        type: "reschedule_activity",
        dayId: d.id,
        activityId: a.id,
        time: "08:00",
        durationMinutes: a.durationMinutes + 5,
      },
    ]);
    expect(next.days[0].activities[0].durationSource).toBe("ai_estimate");
  });
  it("does not manufacture independent minimums from planning allowances or model claims", () => {
    const a = {
      ...trip().days[0].activities[0],
      name: "Universal Studios Japan",
      durationMinutes: 90,
    };
    const forged = {
      minutes: 1,
      basis: "independent_reference" as const,
      provenance: candidate.provenance,
    };
    const located = locateActivity(
      { ...a, minimumDuration: forged },
      tripInput,
    );
    expect(located).not.toHaveProperty("minimumDuration");
    expect(durationConcern(located, tripInput)).toMatch(
      /conservative 360-minute.*not a verified/,
    );
    expect(referenceContext(tripInput)[1]).toMatchObject({
      planningAllowanceMinutes: 360,
    });
    expect(evidencedMinimumDuration(located, tripInput)).toBeNull();
  });
  it("enforces independently sourced minimums only against trusted provider evidence", async () => {
    const minimum = {
      minutes: 60,
      basis: "independent_reference" as const,
      provenance: candidate.provenance,
    };
    expect(minimumDurationSchema.safeParse(minimum).success).toBe(true);
    const adapter = provider({ ...candidate, minimumDuration: minimum });
    const a = await locateWithProvider(
      {
        ...trip().days[0].activities[0],
        name: candidate.name,
        durationMinutes: 30,
      },
      tripInput,
      adapter,
    );
    expect(evidencedMinimumDuration(a, tripInput, [adapter])).toEqual(minimum);
    expect(durationConcern(a, tripInput, [adapter])).toMatch(
      /independently referenced 60-minute minimum/,
    );
    expect(
      durationConcern({ ...a, minimumDuration: undefined }, tripInput, [
        adapter,
      ]),
    ).toMatch(/independently referenced 60-minute minimum/);
    expect(
      durationConcern({ ...a, durationMinutes: 60 }, tripInput, [adapter]),
    ).toBeNull();
    expect(
      evidencedMinimumDuration(
        { ...a, minimumDuration: { ...minimum, minutes: 1 } },
        tripInput,
        [adapter],
      ),
    ).toBeNull();
    expect(evidencedMinimumDuration(a, tripInput)).toBeNull();
  });
  it("AI wire operations cannot supply reference evidence", () => {
    const { id: _id, ...a } = trip().days[0].activities[0];
    void _id;
    const output = {
      kind: "proposal",
      message: "Review",
      operations: [
        {
          type: "replace_activity",
          dayId: "day",
          activityId: "activity",
          activity: {
            ...a,
            minimumDuration: {
              minutes: 60,
              basis: "independent_reference",
              provenance: candidate.provenance,
            },
          },
        },
      ],
    };
    expect(aiEditOutputSchema.safeParse(output).success).toBe(false);
  });
  it("unchanged provenance survives proposal acceptance, reload, undo and restore", async () => {
    const t = trip(),
      d = t.days[0],
      a = d.activities[0];
    a.durationSource = "user_provided";
    const session = createSession(t);
    const response = await normalizeEditResponse(
      {
        kind: "proposal",
        message: "Review",
        operations: [
          {
            type: "reschedule_activity",
            dayId: d.id,
            activityId: a.id,
            time: "08:00",
            durationMinutes: a.durationMinutes,
          },
        ],
      },
      editRequest(session),
      "ai",
    );
    if (response.kind !== "proposal") throw Error("expected proposal");
    const accepted = await acceptProposal(
      { ...session, pendingProposal: response.proposal },
      response.proposal.id,
    );
    const reloaded = JSON.parse(JSON.stringify(accepted));
    expect(
      restoreVersion(undoVersion(reloaded), accepted.activeVersionId),
    ).toEqual({
      ...reloaded,
      revision: reloaded.revision + 2,
      pendingProposal: null,
    });
    expect(
      accepted.versions[1].itinerary.days[0].activities[0].durationSource,
    ).toBe("user_provided");
  });
});
