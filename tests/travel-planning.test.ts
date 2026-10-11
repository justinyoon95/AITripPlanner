import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  dateSchema,
  newTripSchema,
  tripInputSchema,
  itinerarySchema,
} from "@/features/trips/schema";
import {
  addDays,
  calendarDate,
  wallClockInstant,
  latestEndDate,
} from "@/features/trips/calendar";
import { validateNewTrip, validateStoredGeography } from "@/lib/validate-trip";
import { resolveCity, resolveAirport, searchCities } from "@/lib/geography";
import {
  travelWindow,
  scheduleWithinWindow,
  plannedDays,
} from "@/features/trips/travel-planning";
import { seasonalContext } from "@/features/trips/seasons";
import { generateMockItinerary } from "@/features/trips/mock-generator";
import {
  generateItinerary,
  normalizeAIItinerary,
} from "@/lib/ai/itinerary-service";
import { generationRequirements } from "@/lib/ai/generation-requirements";
import { itineraryInput, itineraryInstructions } from "@/lib/ai/prompts";
import { applyEditOperations } from "@/features/trips/edit-engine";
import {
  createSession,
  acceptProposal,
  validateProposal,
  undoVersion,
  restoreVersion,
} from "@/features/trips/versioning";
import { normalizeEditResponse } from "@/lib/ai/edit-service";
import { itineraryFingerprint } from "@/features/trips/fingerprint";
import { unsupportedClaim } from "@/lib/ai/claim-policy";
import { mockEdit } from "@/lib/ai/mock-editor";
import { input, previewId } from "./fixtures";
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("@/lib/ai/client", () => ({
  createOpenAIClient: () => ({ responses: { parse } }),
}));
const now = new Date("2026-11-01T12:00:00Z");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("TRIP_GENERATION_MODE", "ai");
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
  parse.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
function trip() {
  return validateNewTrip(
    {
      ...input,
      destination: "Osaka, Japan",
      startDate: "2027-04-15",
      endDate: "2027-04-20",
      travelers: 2,
      seasonalPreference: "include",
      timezone: "America/Toronto",
      travel: {
        arrival: {
          number: "AC123",
          date: "2027-04-15",
          time: "16:30",
          airportCode: "KIX",
        },
        departure: { date: "2027-04-20", time: "11:00", airportCode: "KIX" },
        accommodation: {
          name: "Example hotel",
          location: "Central Osaka",
          checkInDate: "2027-04-15",
          checkInTime: "20:00",
          checkOutDate: "2027-04-20",
          checkOutTime: "07:30",
        },
      },
    },
    now,
  );
}
it.each([
  "2027-02-30",
  "2027-13-01",
  "20273/2143/2424",
  "2027-02-29",
  "2027-1-1",
  "20273-01-01",
])("rejects invalid calendar value %s", (value) =>
  expect(dateSchema.safeParse(value).success).toBe(false),
);
it.each(["2028-02-29", "2027-01-01", "2026-12-31"])(
  "accepts real date %s",
  (value) => expect(dateSchema.safeParse(value).success).toBe(true),
);
it.each([1, 14])("permits %i inclusive days", (count) =>
  expect(
    newTripSchema(now).safeParse({
      ...input,
      endDate: addDays(input.startDate, count - 1),
    }).success,
  ).toBe(true),
);
it.each([
  { startDate: "2026-10-30", endDate: "2026-11-01" },
  { endDate: "2026-11-30" },
  { endDate: "2026-12-15" },
])("rejects creation dates %j", (dates) =>
  expect(newTripSchema(now).safeParse({ ...input, ...dates }).success).toBe(
    false,
  ),
);
it("uses validated local calendar zones instead of UTC boundaries", () => {
  const instant = new Date("2026-11-01T00:30:00Z");
  expect(calendarDate(instant, "America/Los_Angeles")).toBe("2026-10-31");
  const boundary = { ...input, startDate: "2026-10-31", endDate: "2026-10-31" };
  expect(
    newTripSchema(instant).safeParse({
      ...boundary,
      timezone: "America/Los_Angeles",
    }).success,
  ).toBe(true);
  expect(
    newTripSchema(instant).safeParse({ ...boundary, timezone: "Asia/Tokyo" })
      .success,
  ).toBe(false);
  expect(
    newTripSchema(now).safeParse({ ...input, timezone: "fake/zone" }).success,
  ).toBe(false);
});
it("rejects ambiguous/nonexistent DST wall times", () => {
  expect(() =>
    wallClockInstant("2027-03-14", "02:30", "America/New_York"),
  ).toThrow(/ambiguous|unavailable/);
  expect(() =>
    wallClockInstant("2027-11-07", "01:30", "America/New_York"),
  ).toThrow(/ambiguous|unavailable/);
});
it("bounds calendar iteration and picker limits at the four-digit year boundary", () => {
  expect(latestEndDate("9999-12-30")).toBe("9999-12-31");
  expect(
    plannedDays({ startDate: "9999-12-31", endDate: "9999-12-31" }),
  ).toHaveLength(1);
});
it.each([
  "Tokyo, Japan",
  "Toronto, Canada",
  "Paris, France",
  "London, United Kingdom",
  "Kyoto, Japan",
  "Truth or Consequences, United States",
])("resolves geographic data for %s", (query) =>
  expect(resolveCity(query).id).toMatch(/^\d+$/),
);
it.each(["asdfghjkl", "not-a-real-city-abcdef", "Springfield"])(
  "rejects invalid or unresolved ambiguous query %s",
  (query) => expect(() => resolveCity(query)).toThrow(),
);
it("returns region/country labels and disambiguates by a real identifier", () => {
  const results = searchCities("Springfield");
  expect(results.length).toBeGreaterThan(1);
  expect(resolveCity("Springfield", results[0].id).id).toBe(results[0].id);
  expect(() => resolveCity("Springfield", "9999999999")).toThrow();
  expect(searchCities("Tok").some((city) => city.countryCode === "JP")).toBe(
    true,
  );
  expect(searchCities("Tor")[0].name).toBe("Toronto");
  expect(searchCities("Tok")[0].name).toBe("Tokyo");
});
it("does not let a forged city ID validate unrelated text", () =>
  expect(() =>
    validateNewTrip(
      {
        ...input,
        destination: "asdfghjkl",
        resolvedDestination: resolveCity(input.destination),
      },
      now,
    ),
  ).toThrow());
it("restores trusted metadata rather than trusting client timezone or coordinates", () => {
  const city = resolveCity(input.destination);
  const restored = validateNewTrip(
    {
      ...input,
      resolvedDestination: {
        ...city,
        timezone: "America/Toronto",
        latitude: 1,
      },
    },
    now,
  );
  expect(restored.resolvedDestination).toEqual(city);
  expect(() =>
    validateStoredGeography({
      ...restored,
      resolvedDestination: { ...city, latitude: 1 },
    }),
  ).toThrow();
});
it.each([0, -1, 1.5, 11, NaN, Infinity])(
  "rejects invalid traveler count %s",
  (travelers) =>
    expect(tripInputSchema.safeParse({ ...input, travelers }).success).toBe(
      false,
    ),
);
it.each([0, -1, NaN, Infinity, 1_000_000_001])(
  "rejects invalid budget %s",
  (budget) =>
    expect(tripInputSchema.safeParse({ ...input, budget }).success).toBe(false),
);
it.each([
  {},
  { arrival: { number: "AC123" } },
  { departure: { number: "KE703" } },
  { accommodation: { name: "Example hotel" } },
  { accommodation: { name: "Hotel", location: "Central Osaka" } },
])(
  "accepts optional partial details %j without inventing schedules",
  (travel) => {
    const parsed = validateNewTrip({ ...input, travel }, now);
    expect(parsed.travel).toEqual(travel);
    expect(
      generationRequirements(parsed).windows.every((day) => !day.constrained),
    ).toBe(true);
  },
);
it("computes late-arrival and early-departure windows and reduced counts", () => {
  const value = trip();
  expect(travelWindow(value, value.startDate)).toMatchObject({
    start: 1170,
    travelOnly: false,
  });
  expect(travelWindow(value, value.endDate)).toMatchObject({ end: 480 });
  expect(generationRequirements(value).windows[0].activityCount).toBe(1);
  expect(generationRequirements(value).windows.at(-1)!.activityCount).toBe(0);
  expect(travelWindow(value, value.endDate).travelOnly).toBe(true);
});
it("leaves a very late arrival and very early departure logistics-only", () => {
  const value = trip();
  delete value.travel!.accommodation;
  value.travel!.arrival!.time = "23:30";
  value.travel!.departure!.time = "01:00";
  expect(travelWindow(value, value.startDate).travelOnly).toBe(true);
  expect(travelWindow(value, addDays(value.startDate, 1)).start).toBe(480);
  expect(travelWindow(value, value.endDate).travelOnly).toBe(true);
  expect(travelWindow(value, addDays(value.endDate, -1)).end).toBe(1320);
  const mock = generateMockItinerary(value, previewId);
  expect(mock.days[0].activities).toHaveLength(0);
  expect(mock.days.at(-1)!.activities).toHaveLength(0);
});
it("preserves airport-local input across international date boundaries", () => {
  const value = validateNewTrip(
    {
      ...input,
      destination: "Tokyo, Japan",
      startDate: "2027-04-16",
      endDate: "2027-04-17",
      travel: {
        arrival: { date: "2027-04-15", time: "20:00", airportCode: "LAX" },
      },
    },
    now,
  );
  expect(value.travel?.arrival?.date).toBe("2027-04-15");
  expect(travelWindow(value, value.startDate).start).toBe(900);
});
it.each([
  { arrival: { date: "2027-04-16", time: "16:00", airportCode: "KIX" } },
  { arrival: { time: "16:00" } },
  { arrival: { date: "2027-04-15", time: "25:00", airportCode: "KIX" } },
  { arrival: { number: "nonsense" } },
  { departure: { date: "2027-04-14" } },
  { accommodation: { checkInDate: "2027-04-19", checkOutDate: "2027-04-18" } },
  { accommodation: { checkInTime: "15:00" } },
  { accommodation: { checkInDate: "2027-04-21" } },
  { accommodation: { name: "x".repeat(201) } },
])("rejects contradictory/malformed travel %j", (travel) =>
  expect(() => validateNewTrip({ ...trip(), travel }, now)).toThrow(),
);
it("requires valid airport references and checks check-in/out flight conflicts", () => {
  expect(() => resolveAirport("QZZ")).toThrow();
  const value = trip();
  value.travel!.accommodation!.checkInTime = "17:00";
  expect(() => validateNewTrip(value, now)).toThrow();
  value.travel!.accommodation!.checkInTime = "20:00";
  value.travel!.accommodation!.checkOutTime = "09:00";
  expect(() => validateNewTrip(value, now)).toThrow();
});
it("rejects activity conflicts with flights and planned hotel appointments", () => {
  const value = trip();
  expect(
    scheduleWithinWindow(value, value.startDate, [
      { time: "15:00", durationMinutes: 60 },
    ]),
  ).toBe(false);
  expect(
    scheduleWithinWindow(value, value.startDate, [
      { time: "20:00", durationMinutes: 60 },
    ]),
  ).toBe(false);
  expect(
    scheduleWithinWindow(value, value.startDate, [
      { time: "21:00", durationMinutes: 60 },
    ]),
  ).toBe(true);
});
it("does not allow ordinary days to become empty", () => {
  const mock = generateMockItinerary(input, previewId);
  mock.days[0].activities = [];
  expect(itinerarySchema.safeParse(mock).success).toBe(false);
});
it("preserves legacy historical records and their fingerprints without fabricating fields", async () => {
  const old = generateMockItinerary(
    { ...input, startDate: "2020-01-01", endDate: "2020-01-03" },
    previewId,
  );
  const parsed = itinerarySchema.parse(old);
  expect(parsed.input).toEqual(old.input);
  expect(parsed.input.travelers).toBeUndefined();
  expect(await itineraryFingerprint(parsed)).toBe(
    await itineraryFingerprint(old),
  );
});
it("preserves optional metadata through review, acceptance, stale checks, undo and restore", async () => {
  const value = trip();
  delete value.travel!.accommodation;
  const mock = generateMockItinerary(value, previewId);
  const session = createSession(mock);
  const request = {
    itinerary: mock,
    baseVersionId: session.activeVersionId,
    baseRevision: 0,
    message: "Remove an activity",
    scope: null,
    context: [],
  };
  const day = mock.days[1];
  const response = await normalizeEditResponse(
    {
      kind: "proposal",
      message: "Review this removal",
      operations: [
        {
          type: "remove_activity",
          dayId: day.id,
          activityId: day.activities[0].id,
        },
      ],
    },
    request,
    "mock",
  );
  if (response.kind !== "proposal") throw new Error("Expected proposal");
  const accepted = await acceptProposal(
    { ...session, pendingProposal: response.proposal },
    response.proposal.id,
  );
  expect(accepted.versions[1].itinerary.input).toEqual(value);
  expect(
    restoreVersion(undoVersion(accepted), accepted.activeVersionId).versions,
  ).toEqual(accepted.versions);
  await expect(
    validateProposal(
      { ...accepted, pendingProposal: response.proposal },
      response.proposal,
    ),
  ).rejects.toMatchObject({ code: "STALE_PROPOSAL" });
  expect(() =>
    applyEditOperations(mock, [
      {
        type: "reschedule_activity",
        dayId: mock.days[0].id,
        activityId: mock.days[0].activities[0].id,
        time: "09:00",
        durationMinutes: 60,
      },
    ]),
  ).toThrow();
});
it.each(["include", "prioritize", "exclude"] as const)(
  "passes seasonal policy %s and travel constraints to generation",
  (seasonalPreference) => {
    const value = { ...trip(), seasonalPreference };
    const context = JSON.parse(itineraryInput(value));
    expect(context.travelers).toBe(2);
    expect(context.seasonalContext.preference).toBe(seasonalPreference);
    expect(context.planningWindows[0].start).toBe(1170);
    expect(context.travel.arrival.number).toBe("AC123");
  },
);
it.each([
  ["Vienna, Austria", "2027-12-01", "winter"],
  ["Tokyo, Japan", "2027-04-01", "spring"],
  ["Seoul, South Korea", "2027-10-01", "autumn"],
  ["Sydney, Australia", "2027-12-01", "summer"],
])(
  "provides broad seasonal context for %s",
  (destination, startDate, season) => {
    expect(
      seasonalContext({
        ...input,
        startDate,
        endDate: startDate,
        resolvedDestination: resolveCity(destination),
      }).broadSeason,
    ).toBe(season);
  },
);
it("forbids confirmed event claims without pretending to verify seasonal facts", () => {
  expect(itineraryInstructions).toContain("never invent event names");
  expect(
    unsupportedClaim("The festival takes place on December 24 at 18:00."),
  ).toBe(true);
  expect(
    unsupportedClaim(
      "Consider seasonal markets; current schedules are unverified.",
    ),
  ).toBe(false);
});
it.each([
  { destination: "asdfghjkl" },
  { startDate: "2020-01-01", endDate: "2020-01-03" },
  { travel: { arrival: { time: "25:00" } } },
  { destination: "Springfield" },
])("rejects invalid creation before a paid model call %j", async (fields) => {
  await expect(generateItinerary({ ...input, ...fields })).rejects.toThrow();
  expect(parse).not.toHaveBeenCalled();
});
it("rejects model output outside its travel window", () => {
  const value = trip();
  delete value.travel!.accommodation;
  const mock = generateMockItinerary(value, previewId);
  const raw = {
    overview: "An estimated trip",
    assumptions: [],
    warnings: [],
    budgetAssessment: {
      status: "uncertain",
      explanation: "Estimates require verification.",
    },
    days: mock.days.map((day) => ({
      ...day,
      additionalCosts: {
        accommodation: 0,
        localTransport: 0,
        additionalMeals: 0,
      },
    })),
  };
  raw.days[0].activities[0].time = "09:00";
  expect(() => normalizeAIItinerary(raw, value)).toThrow(
    /arrival|travel|logistics/,
  );
});
it("generates a complete mock with accommodation and normalizes equivalent AI output", async () => {
  const value = trip();
  const mock = generateMockItinerary(value, previewId);
  expect(mock.input).toEqual(value);
  const raw = {
    overview: "A trip with estimated travel logistics.",
    assumptions: ["Airport buffers and all costs are estimates."],
    warnings: [],
    budgetAssessment: {
      status: "uncertain",
      explanation: "Prices are estimates.",
    },
    days: mock.days.map(({ number, date, title, activities }) => ({
      number,
      date,
      title,
      activities: activities.map((activity) => ({
        name: activity.name,
        description: activity.description,
        category: activity.category,
        time: activity.time,
        durationMinutes: activity.durationMinutes,
        estimatedCost: activity.estimatedCost,
      })),
      additionalCosts: {
        accommodation: 100,
        localTransport: 20,
        additionalMeals: 10,
      },
    })),
  };
  parse.mockResolvedValue({
    status: "completed",
    output: [],
    output_parsed: raw,
  });
  const generated = await generateItinerary(value);
  expect(parse).toHaveBeenCalledTimes(1);
  expect(generated.input).toEqual(value);
  expect(
    generated.days.every((day) =>
      scheduleWithinWindow(value, day.date, day.activities),
    ),
  ).toBe(true);
  expect(
    generated.days
      .flatMap((day) => [day.id, ...day.activities.map((a) => a.id)])
      .every((id) => /^[0-9a-f-]{36}$/.test(id)),
  ).toBe(true);
});
it("keeps date-only boundary flights unscheduled rather than inferring times", () => {
  const value = validateNewTrip(
    { ...input, travel: { arrival: { date: input.startDate } } },
    now,
  );
  expect(generateMockItinerary(value, previewId).days[0].activities).toEqual(
    [],
  );
  expect(
    mockEdit({
      itinerary: generateMockItinerary(value, previewId),
      baseVersionId: previewId,
      baseRevision: 0,
      message: "Make Day 1 less busy",
      scope: null,
      context: [],
    }),
  ).toMatchObject({ kind: "clarification", operations: [] });
});
it("rejects an addition to a travel-only day without changing the original", () => {
  const value = trip();
  delete value.travel!.accommodation;
  value.travel!.arrival!.time = "23:30";
  const mock = generateMockItinerary(value, previewId);
  const before = structuredClone(mock);
  expect(() =>
    applyEditOperations(mock, [
      {
        type: "add_activity",
        dayId: mock.days[0].id,
        activity: {
          ...mock.days[1].activities[0],
          id: "76ed1b3f-81b8-4a2c-97a5-6a2dfc437bc0",
          time: "23:30",
          durationMinutes: 15,
        },
      },
    ]),
  ).toThrow(/travel-only|arrival/);
  expect(mock).toEqual(before);
});
it("rejects an infeasible same-day airport window before the model is called", async () => {
  await expect(
    generateItinerary({
      ...input,
      destination: "Osaka, Japan",
      startDate: "2027-04-15",
      endDate: "2027-04-15",
      travel: {
        arrival: { date: "2027-04-15", time: "12:00", airportCode: "KIX" },
        departure: { date: "2027-04-15", time: "16:00", airportCode: "KIX" },
      },
    }),
  ).rejects.toThrow(/buffers/);
  expect(parse).not.toHaveBeenCalled();
});
