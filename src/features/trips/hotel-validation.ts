import { wallClockInstant } from "./calendar";
import {
  AIRPORT_BUFFER_MINUTES,
  flightAtDestination,
  type PlanningInput,
} from "./travel-planning";

export function validateAccommodation(
  input: PlanningInput,
  issue: (path: string[], message: string) => void,
) {
  const hotel = input.travel?.accommodation;
  if (!hotel) return;
  const fail = (field: string, message: string) =>
    issue(["travel", "accommodation", field], message);
  for (const [dateKey, timeKey] of [
    ["checkInDate", "checkInTime"],
    ["checkOutDate", "checkOutTime"],
    ["plannedHotelArrivalDate", "plannedHotelArrivalTime"],
    ["plannedHotelDepartureDate", "plannedHotelDepartureTime"],
  ] as const) {
    const date = hotel[dateKey],
      time = hotel[timeKey];
    const planned = dateKey.startsWith("planned");
    if (time && !date)
      fail(dateKey, "Provide the planned movement date with its time.");
    if (planned && date && !time)
      fail(
        timeKey,
        "Provide the planned movement time, or leave both movement fields blank.",
      );
    if (date && (date < input.startDate || date > input.endDate))
      fail(dateKey, "Accommodation dates must fall within travel dates.");
    if (planned && date && time && input.resolvedDestination) {
      try {
        wallClockInstant(date, time, input.resolvedDestination.timezone);
      } catch {
        fail(
          timeKey,
          "That local hotel time is unavailable or ambiguous. Choose an unambiguous local time.",
        );
      }
    }
  }
  if (
    hotel.checkInDate &&
    hotel.checkOutDate &&
    hotel.checkOutDate < hotel.checkInDate
  )
    fail("checkOutDate", "Check-out must follow check-in.");
  const at = (date?: string, time?: string) =>
    date && time ? `${date}T${time}` : null;
  const arrival = at(
    hotel.plannedHotelArrivalDate,
    hotel.plannedHotelArrivalTime,
  );
  const departure = at(
    hotel.plannedHotelDepartureDate,
    hotel.plannedHotelDepartureTime,
  );
  if (arrival && hotel.checkInAvailableFrom && !hotel.checkInDate)
    fail(
      "checkInDate",
      "Provide the stay check-in date to compare a planned arrival with the opening policy, including overnight arrivals.",
    );
  if (departure && hotel.checkOutBy && !hotel.checkOutDate)
    fail(
      "checkOutDate",
      "Provide the stay checkout date to compare a planned departure with the checkout deadline.",
    );
  if (arrival && departure && departure <= arrival)
    fail(
      "plannedHotelDepartureTime",
      "Planned hotel departure must be after planned arrival.",
    );
  else if (
    arrival &&
    departure &&
    Date.parse(`${departure}:00Z`) - Date.parse(`${arrival}:00Z`) < 60 * 60_000
  )
    fail(
      "plannedHotelDepartureTime",
      "Allow the estimated arrival and departure logistics buffers between hotel movements (30 minutes each).",
    );
  const available = at(hotel.checkInDate, hotel.checkInAvailableFrom);
  const deadline = at(hotel.checkOutDate, hotel.checkOutBy);
  if (arrival && available && arrival < available)
    fail(
      "plannedHotelArrivalTime",
      "Planned arrival is before check-in opens. Confirm early access or choose a later arrival.",
    );
  if (departure && deadline && departure > deadline)
    fail(
      "plannedHotelDepartureTime",
      "Planned departure is after the checkout deadline. Confirm late checkout or leave earlier.",
    );
  if (arrival && deadline && arrival > deadline)
    fail(
      "plannedHotelArrivalTime",
      "Planned hotel arrival is after the stay's checkout deadline. Check the stay dates.",
    );
  if (departure && available && departure < available)
    fail(
      "plannedHotelDepartureTime",
      "Planned hotel departure is before the stay's check-in opening. Check the stay dates or confirmed early access.",
    );
  for (const [date, field] of [
    [hotel.plannedHotelArrivalDate, "plannedHotelArrivalDate"],
    [hotel.plannedHotelDepartureDate, "plannedHotelDepartureDate"],
  ] as const) {
    if (
      date &&
      ((hotel.checkInDate && date < hotel.checkInDate) ||
        (hotel.checkOutDate && date > hotel.checkOutDate))
    )
      fail(
        field,
        "The planned movement must fall within the accommodation stay.",
      );
  }
  try {
    const ready = flightAtDestination(input, "arrival", AIRPORT_BUFFER_MINUTES);
    const leave = flightAtDestination(
      input,
      "departure",
      -AIRPORT_BUFFER_MINUTES,
    );
    if (arrival && ready && arrival < `${ready.date}T${ready.time}`)
      fail(
        "plannedHotelArrivalTime",
        "Planned hotel arrival must allow the estimated arrival procedures and transfer buffer.",
      );
    if (departure && ready && departure < `${ready.date}T${ready.time}`)
      fail(
        "plannedHotelDepartureTime",
        "Planned hotel departure cannot precede arrival procedures and the estimated transfer buffer.",
      );
    if (arrival && leave && arrival > `${leave.date}T${leave.time}`)
      fail(
        "plannedHotelArrivalTime",
        "Planned hotel arrival is after the airport departure buffer begins. Check the movement and flight dates.",
      );
    if (departure && leave && departure > `${leave.date}T${leave.time}`)
      fail(
        "plannedHotelDepartureTime",
        "Plan hotel departure before the estimated airport departure buffer begins.",
      );
  } catch {
    /* Flight fields report unresolved airport/timezone errors. */
  }
}
