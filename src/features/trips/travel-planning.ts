import {
  addDays,
  clock,
  localDateTime,
  minutes,
  wallClockInstant,
  tripDayCount,
} from "./calendar";
import type { Destination, TravelDetails } from "./planning-schema";

export const AIRPORT_BUFFER_MINUTES = 180;
export type PlanningInput = {
  startDate: string;
  endDate: string;
  resolvedDestination?: Destination;
  travel?: TravelDetails;
};
export type TravelWindow = {
  start: number;
  end: number;
  travelOnly: boolean;
  constrained: boolean;
  notes: string[];
  appointments: { start: number; end: number }[];
};
export function flightAtDestination(
  input: PlanningInput,
  kind: "arrival" | "departure",
  buffer = 0,
) {
  const flight = input.travel?.[kind];
  if (!flight?.date || !flight.time) return null;
  if (!input.resolvedDestination)
    throw new Error("Select a destination before entering flight times.");
  const from = flight.airport?.timezone;
  if (!from) throw new Error("Enter a recognized airport for flight times.");
  return localDateTime(
    wallClockInstant(flight.date, flight.time, from) + buffer * 60_000,
    input.resolvedDestination.timezone,
  );
}
export function travelWindow(input: PlanningInput, date: string): TravelWindow {
  let start = 0,
    end = 1440;
  const notes: string[] = [];
  const appointments: TravelWindow["appointments"] = [];
  const arrival = flightAtDestination(input, "arrival"),
    departure = flightAtDestination(input, "departure");
  const ready = flightAtDestination(input, "arrival", AIRPORT_BUFFER_MINUTES),
    leave = flightAtDestination(input, "departure", -AIRPORT_BUFFER_MINUTES);
  if (ready)
    start =
      date < ready.date ? 1440 : date === ready.date ? minutes(ready.time) : 0;
  if (leave)
    end =
      date > leave.date ? 0 : date === leave.date ? minutes(leave.time) : 1440;
  if (arrival?.date === date) {
    notes.push(
      `Arrival ${input.travel!.arrival!.time} at ${input.travel!.arrival!.airportCode} (airport local time). Reserve an estimated 3 hours for airport procedures and ground transfer; route duration is unverified.`,
    );
  }
  if (departure?.date === date) {
    notes.push(
      `Departure ${input.travel!.departure!.time} at ${input.travel!.departure!.airportCode} (airport local time). Reserve an estimated 3 hours before departure for transfer and airport procedures; verify your airline's requirements.`,
    );
  }
  const hotel = input.travel?.accommodation;
  if (hotel && date === hotel.checkInDate) {
    notes.push(
      `Check-in${hotel.checkInTime ? ` at ${hotel.checkInTime}` : " time unknown"}. Do not assume early access or luggage storage.`,
    );
    if (hotel.checkInTime)
      appointments.push({
        start: minutes(hotel.checkInTime),
        end: Math.min(1440, minutes(hotel.checkInTime) + 30),
      });
  }
  if (hotel && date === hotel.checkOutDate) {
    notes.push(
      `Check-out${hotel.checkOutTime ? ` at ${hotel.checkOutTime}` : " time unknown"}. Plan luggage arrangements; storage is not confirmed.`,
    );
    if (hotel.checkOutTime)
      appointments.push({
        start: Math.max(0, minutes(hotel.checkOutTime) - 30),
        end: minutes(hotel.checkOutTime),
      });
  }
  // Boundary travel days with under an hour available stay logistics-only.
  const constrained =
    arrival?.date === date ||
    departure?.date === date ||
    start > 0 ||
    end < 1440;
  const unknownBoundary = (["arrival", "departure"] as const).some(
    (kind) => input.travel?.[kind]?.date === date && !input.travel[kind]?.time,
  );
  if (constrained) {
    // Do not create technically valid midnight sightseeing before early flights.
    start = Math.max(start, 8 * 60);
    end = Math.min(end, 23 * 60);
    notes.push(
      "Flight-constrained sightseeing uses an 08:00-23:00 planning window; this is a planning estimate, not venue operating hours.",
    );
  }
  if (unknownBoundary)
    notes.push(
      "A boundary flight time is unknown. Leave this day unscheduled rather than inventing available sightseeing time.",
    );
  return {
    start,
    end,
    constrained: constrained || unknownBoundary,
    travelOnly: unknownBoundary || (constrained && end - start < 60),
    notes,
    appointments,
  };
}
export function scheduleWithinWindow(
  input: PlanningInput,
  date: string,
  activities: { time: string; durationMinutes: number }[],
) {
  const window = travelWindow(input, date);
  if (window.travelOnly) return activities.length === 0;
  return (
    activities.length > 0 &&
    activities.every(
      (a) =>
        minutes(a.time) >= window.start &&
        minutes(a.time) + a.durationMinutes <= window.end &&
        window.appointments.every(
          (slot) =>
            minutes(a.time) + a.durationMinutes <= slot.start ||
            minutes(a.time) >= slot.end,
        ),
    )
  );
}
export function plannedDays(input: PlanningInput) {
  return Array.from(
    { length: tripDayCount(input.startDate, input.endDate) },
    (_, index) => {
      const date = addDays(input.startDate, index);
      return { date, ...travelWindow(input, date) };
    },
  );
}
export function windowLabel(window: TravelWindow) {
  return window.travelOnly
    ? "Travel logistics only; no activity window remains."
    : `Activity window: ${clock(window.start)} to ${window.end === 1440 ? "24:00" : clock(window.end)} (destination local time).`;
}
