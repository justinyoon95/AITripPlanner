import { afterEach, expect, it, vi } from "vitest";
import { validateNewTrip } from "@/lib/validate-trip";
import { generateMockItinerary } from "@/features/trips/mock-generator";
import {
  travelWindow,
  scheduleWithinWindow,
} from "@/features/trips/travel-planning";
import { applyEditOperations } from "@/features/trips/edit-engine";
import { itinerarySchema } from "@/features/trips/schema";
import { createSession } from "@/features/trips/versioning";
import { itineraryFingerprint } from "@/features/trips/fingerprint";
import {
  readSession,
  writeSession,
  recoverSession,
} from "@/features/trips/session-storage";
import { storePreview } from "@/features/trips/storage";
import {
  generationRequirements,
  validateGeneratedSchedule,
} from "@/lib/ai/generation-requirements";
import { itineraryInput } from "@/lib/ai/prompts";
import { input, previewId, aiFixture } from "./fixtures";

const now = new Date("2026-10-15T12:00:00Z");
function trip() {
  return validateNewTrip(
    {
      ...input,
      destination: "Osaka, Japan",
      startDate: "2027-04-15",
      endDate: "2027-04-18",
      travelers: 2,
      travel: {
        arrival: { date: "2027-04-15", time: "20:30", airportCode: "KIX" },
        departure: { date: "2027-04-18", time: "09:00", airportCode: "KIX" },
        accommodation: {
          name: "Example hotel",
          checkInDate: "2027-04-15",
          checkInAvailableFrom: "15:00",
          checkOutDate: "2027-04-18",
          checkOutBy: "11:00",
        },
      },
    },
    now,
  );
}
afterEach(() => vi.unstubAllGlobals());
it("accepts check-in opening before arrival and checkout deadline after an early flight", () => {
  const value = trip();
  expect(value.travel!.accommodation!.checkInAvailableFrom).toBe("15:00");
  expect(value.travel!.accommodation!.checkOutBy).toBe("11:00");
  expect(travelWindow(value, value.startDate).appointments).toEqual([]);
  expect(travelWindow(value, value.endDate).appointments).toEqual([]);
  expect(travelWindow(value, value.startDate).travelOnly).toBe(true);
  expect(travelWindow(value, value.endDate).travelOnly).toBe(true);
});
it("allows policy times without requiring planned movements or policy dates", () => {
  const value = trip();
  value.travel!.accommodation = {
    checkInAvailableFrom: "15:00",
    checkOutBy: "11:00",
  };
  expect(() => validateNewTrip(value, now)).not.toThrow();
});
it.each([
  { plannedHotelArrivalDate: "2027-04-15", plannedHotelArrivalTime: "21:00" },
  {
    plannedHotelDepartureDate: "2027-04-18",
    plannedHotelDepartureTime: "07:00",
  },
  { plannedHotelArrivalDate: "2027-04-15" },
  { plannedHotelDepartureTime: "05:30" },
  {
    plannedHotelDepartureDate: "2027-04-15",
    plannedHotelDepartureTime: "18:00",
  },
  { plannedHotelArrivalDate: "2027-04-18", plannedHotelArrivalTime: "07:00" },
  { plannedHotelArrivalDate: "2027-04-19", plannedHotelArrivalTime: "10:00" },
])(
  "rejects explicit movement conflict %j with field-specific errors",
  (movement) => {
    const value = trip();
    Object.assign(value.travel!.accommodation!, movement);
    try {
      validateNewTrip(value, now);
      throw new Error("Expected validation");
    } catch (error) {
      expect(error).toHaveProperty("issues");
      expect(
        (error as { issues: { path: string[] }[] }).issues.some((i) =>
          i.path.includes("accommodation"),
        ),
      ).toBe(true);
    }
  },
);
it("reserves only explicit late arrival and early departure, including overnight buffers", () => {
  const value = trip();
  Object.assign(value.travel!.accommodation!, {
    plannedHotelArrivalDate: "2027-04-15",
    plannedHotelArrivalTime: "23:45",
    plannedHotelDepartureDate: "2027-04-18",
    plannedHotelDepartureTime: "05:30",
  });
  expect(() => validateNewTrip(value, now)).not.toThrow();
  expect(travelWindow(value, "2027-04-15").appointments).toEqual([
    { start: 1425, end: 1440 },
  ]);
  expect(travelWindow(value, "2027-04-16").appointments).toEqual([
    { start: 0, end: 15 },
  ]);
  expect(travelWindow(value, "2027-04-18").appointments).toEqual([
    { start: 300, end: 330 },
  ]);
});
it("supports next-calendar-day hotel arrival without treating 00:10 as before 15:00 the previous day", () => {
  const value = trip();
  Object.assign(value.travel!.accommodation!, {
    plannedHotelArrivalDate: "2027-04-16",
    plannedHotelArrivalTime: "00:10",
  });
  expect(() => validateNewTrip(value, now)).not.toThrow();
});
it("requires stay dates only when comparing explicit movements with policy deadlines", () => {
  const value = trip();
  delete value.travel!.accommodation!.checkInDate;
  Object.assign(value.travel!.accommodation!, {
    plannedHotelArrivalDate: "2027-04-16",
    plannedHotelArrivalTime: "00:10",
  });
  expect(() => validateNewTrip(value, now)).toThrow(/stay check-in date/);
});
it("reserves early hotel-departure preparation across midnight", () => {
  const value = trip();
  Object.assign(value.travel!.accommodation!, {
    plannedHotelDepartureDate: "2027-04-18",
    plannedHotelDepartureTime: "00:10",
  });
  expect(() => validateNewTrip(value, now)).not.toThrow();
  expect(travelWindow(value, "2027-04-17").appointments).toEqual([
    { start: 1420, end: 1440 },
  ]);
  expect(travelWindow(value, "2027-04-18").appointments).toEqual([
    { start: 0, end: 10 },
  ]);
});
it("rejects overlapping hotel movement buffers instead of silently rescheduling them", () => {
  const value = trip();
  Object.assign(value.travel!.accommodation!, {
    plannedHotelArrivalDate: "2027-04-16",
    plannedHotelArrivalTime: "00:10",
    plannedHotelDepartureDate: "2027-04-16",
    plannedHotelDepartureTime: "00:20",
  });
  expect(() => validateNewTrip(value, now)).toThrow(/logistics buffers/);
});
it("generation rejects an actual hotel appointment overlap but accepts a policy opening", () => {
  const value = trip();
  delete value.travel!.arrival;
  delete value.travel!.departure;
  const output = aiFixture(value);
  output.days[0].activities[1].time = "15:00";
  expect(() => validateGeneratedSchedule(output, value)).not.toThrow();
  Object.assign(value.travel!.accommodation!, {
    plannedHotelArrivalDate: value.startDate,
    plannedHotelArrivalTime: "15:00",
  });
  expect(() => validateGeneratedSchedule(output, value)).toThrow(
    /accommodation logistics/,
  );
});
it("enforces actual hotel appointments but not policy hours during editing", () => {
  const value = trip();
  delete value.travel!.arrival;
  delete value.travel!.departure;
  Object.assign(value.travel!.accommodation!, {
    plannedHotelArrivalDate: "2027-04-15",
    plannedHotelArrivalTime: "17:00",
  });
  expect(
    scheduleWithinWindow(value, value.startDate, [
      { time: "15:00", durationMinutes: 30 },
    ]),
  ).toBe(true);
  expect(
    scheduleWithinWindow(value, value.startDate, [
      { time: "17:00", durationMinutes: 30 },
    ]),
  ).toBe(false);
  const itinerary = generateMockItinerary(value, previewId);
  expect(() =>
    applyEditOperations(itinerary, [
      {
        type: "reschedule_activity",
        dayId: itinerary.days[0].id,
        activityId: itinerary.days[0].activities[0].id,
        time: "17:00",
        durationMinutes: 30,
      },
    ]),
  ).toThrow(/accommodation/);
});
it("rejects planned movements before opening, after deadline or in reversed order", () => {
  const value = trip();
  delete value.travel!.arrival;
  delete value.travel!.departure;
  for (const movement of [
    { plannedHotelArrivalDate: "2027-04-15", plannedHotelArrivalTime: "14:00" },
    {
      plannedHotelDepartureDate: "2027-04-18",
      plannedHotelDepartureTime: "12:00",
    },
    {
      plannedHotelArrivalDate: "2027-04-17",
      plannedHotelArrivalTime: "16:00",
      plannedHotelDepartureDate: "2027-04-16",
      plannedHotelDepartureTime: "09:00",
    },
  ])
    expect(() =>
      validateNewTrip(
        {
          ...value,
          travel: {
            accommodation: { ...value.travel!.accommodation, ...movement },
          },
        },
        now,
      ),
    ).toThrow();
});
it("generation uses corrected windows and retains logistics-only flight days", () => {
  const value = trip();
  const mock = generateMockItinerary(value, previewId);
  expect(mock.days[0].activities).toEqual([]);
  expect(mock.days.at(-1)!.activities).toEqual([]);
  expect(generationRequirements(value).windows[0].appointments).toEqual([]);
  expect(() =>
    validateGeneratedSchedule(aiFixture(value), value),
  ).not.toThrow();
  expect(
    JSON.parse(itineraryInput(value)).travel.accommodation.checkInAvailableFrom,
  ).toBe("15:00");
});
it("loads legacy hotel fields without inventing policy/movements, rewriting snapshots or fingerprints", async () => {
  const value = trip();
  value.travel!.accommodation = {
    checkInDate: value.startDate,
    checkInTime: "15:00",
    checkOutDate: value.endDate,
    checkOutTime: "11:00",
  };
  const itinerary = generateMockItinerary(value, previewId);
  const before = await itineraryFingerprint(itinerary);
  const records = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => records.get(k) ?? null,
      setItem: (k: string, v: string) => records.set(k, v),
    },
  });
  storePreview(itinerary);
  const raw = records.get(`trip-planner:preview:v1:${previewId}`);
  const legacy = readSession(previewId)!;
  writeSession(legacy);
  const restored = await recoverSession(readSession(previewId)!);
  expect(restored.versions[0].itinerary.input).toEqual(itinerary.input);
  expect(records.get(`trip-planner:preview:v1:${previewId}`)).toBe(raw);
  expect(await itineraryFingerprint(restored.versions[0].itinerary)).toBe(
    before,
  );
  expect(itinerarySchema.parse(itinerary)).toEqual(itinerary);
  expect(travelWindow(value, value.startDate).notes.join(" ")).toContain(
    "Legacy",
  );
  expect(createSession(itinerary).versions).toHaveLength(1);
});
