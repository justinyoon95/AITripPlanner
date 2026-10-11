import { z } from "zod";
import {
  dateSchema,
  tripDayCount,
  calendarDate,
  timezoneSchema,
} from "./calendar";
import {
  destinationSchema,
  travelSchema,
  seasonalSchema,
  MAX_TRAVELERS,
} from "./planning-schema";
import { flightAtDestination, scheduleWithinWindow } from "./travel-planning";
export { dateSchema, tripDayCount, DAY_MS } from "./calendar";

export const MAX_TRIP_DAYS = 14;
export const INTERESTS = [
  "Food",
  "Shopping",
  "Nature",
  "Culture",
  "Nightlife",
  "Relaxation",
] as const;
export const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "JPY", "KRW"] as const;
export const PACES = ["relaxed", "moderate", "packed"] as const;
export const tripInputSchema = z
  .strictObject({
    destination: z
      .string()
      .trim()
      .min(2, "Enter a destination with at least 2 characters.")
      .max(100, "Use 100 characters or fewer."),
    startDate: dateSchema,
    endDate: dateSchema,
    budget: z
      .number({ error: "Enter a valid budget." })
      .finite()
      .positive("Budget must be greater than zero.")
      .max(1_000_000_000, "Budget is too large.")
      .refine(
        (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001,
        "Use at most two decimal places.",
      ),
    currency: z.enum(CURRENCIES),
    interests: z
      .array(z.enum(INTERESTS))
      .min(1, "Choose at least one interest.")
      .max(INTERESTS.length)
      .refine(
        (values) => new Set(values).size === values.length,
        "Choose each interest only once.",
      ),
    pace: z.enum(PACES),
    preferences: z.string().trim().max(1000, "Use 1,000 characters or fewer."),
    resolvedDestination: destinationSchema.optional(),
    timezone: timezoneSchema.optional(),
    travelers: z.number().int().min(1).max(MAX_TRAVELERS).optional(),
    seasonalPreference: seasonalSchema.optional(),
    travel: travelSchema.optional(),
  })
  .superRefine((input, ctx) => {
    if (
      !dateSchema.safeParse(input.startDate).success ||
      !dateSchema.safeParse(input.endDate).success
    )
      return;
    const days = tripDayCount(input.startDate, input.endDate);
    if (days < 1)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date must be on or after the start date.",
      });
    if (days > MAX_TRIP_DAYS)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: `Choose a trip of ${MAX_TRIP_DAYS} days or fewer.`,
      });
    const issue = (path: string[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    for (const kind of ["arrival", "departure"] as const) {
      const flight = input.travel?.[kind];
      if (!flight) continue;
      if (flight.time && (!flight.date || !flight.airportCode))
        issue(
          ["travel", kind, "time"],
          "Provide the flight date and airport with its local time.",
        );
      if (
        flight.date &&
        !flight.time &&
        flight.date !== (kind === "arrival" ? input.startDate : input.endDate)
      )
        issue(
          ["travel", kind, "date"],
          "Arrival/departure dates must match the trip boundary; provide a time and airport for timezone conversion.",
        );
      if (
        flight.date &&
        flight.time &&
        flight.airport &&
        input.resolvedDestination
      ) {
        try {
          const local = flightAtDestination(input, kind)!;
          if (
            local.date !==
            (kind === "arrival" ? input.startDate : input.endDate)
          )
            issue(
              ["travel", kind, "date"],
              `The ${kind} must match the ${kind === "arrival" ? "start" : "end"} date in the destination timezone.`,
            );
        } catch (error) {
          issue(["travel", kind, "time"], (error as Error).message);
        }
      }
    }
    const arrival = input.travel?.arrival,
      departure = input.travel?.departure;
    if (
      arrival?.date &&
      arrival.time &&
      arrival.airport &&
      departure?.date &&
      departure.time &&
      departure.airport
    ) {
      try {
        const a = flightAtDestination(input, "arrival"),
          d = flightAtDestination(input, "departure");
        if (a && d && `${a.date}T${a.time}` >= `${d.date}T${d.time}`)
          issue(
            ["travel", "departure", "time"],
            "Departure must be after arrival.",
          );
        const ready = flightAtDestination(input, "arrival", 180),
          leave = flightAtDestination(input, "departure", -180);
        if (
          ready &&
          leave &&
          `${ready.date}T${ready.time}` >= `${leave.date}T${leave.time}`
        )
          issue(
            ["travel", "departure", "time"],
            "Arrival and departure leave no room for the estimated airport/transfer buffers. Adjust the trip details.",
          );
      } catch {
        /* Field-specific timezone errors are reported above. */
      }
    }
    const hotel = input.travel?.accommodation;
    if (hotel) {
      for (const [dateKey, timeKey] of [
        ["checkInDate", "checkInTime"],
        ["checkOutDate", "checkOutTime"],
      ] as const) {
        if (hotel[timeKey] && !hotel[dateKey])
          issue(
            ["travel", "accommodation", timeKey],
            "Provide the accommodation date with its time.",
          );
        if (
          hotel[dateKey] &&
          (hotel[dateKey]! < input.startDate || hotel[dateKey]! > input.endDate)
        )
          issue(
            ["travel", "accommodation", dateKey],
            "Accommodation dates must fall within travel dates.",
          );
      }
      if (
        hotel.checkInDate &&
        hotel.checkOutDate &&
        (hotel.checkOutDate < hotel.checkInDate ||
          (hotel.checkInDate === hotel.checkOutDate &&
            hotel.checkInTime &&
            hotel.checkOutTime &&
            hotel.checkOutTime <= hotel.checkInTime))
      )
        issue(
          ["travel", "accommodation", "checkOutDate"],
          "Check-out must follow check-in.",
        );
      try {
        const a = flightAtDestination(input, "arrival", 180),
          d = flightAtDestination(input, "departure", -180);
        if (
          hotel.checkInDate &&
          hotel.checkInTime &&
          a &&
          `${hotel.checkInDate}T${hotel.checkInTime}` < `${a.date}T${a.time}`
        )
          issue(
            ["travel", "accommodation", "checkInTime"],
            "Planned check-in must allow arrival procedures and transfer time.",
          );
        if (
          hotel.checkOutDate &&
          hotel.checkOutTime &&
          d &&
          `${hotel.checkOutDate}T${hotel.checkOutTime}` > `${d.date}T${d.time}`
        )
          issue(
            ["travel", "accommodation", "checkOutTime"],
            "Plan check-out before the airport departure buffer begins.",
          );
      } catch {
        /* Flight fields report invalid local times. */
      }
    }
  });

// Creation-only policy. Never use a moving 'today' bound to parse stored snapshots.
export function newTripSchema(now = new Date()) {
  return tripInputSchema.superRefine((input, ctx) => {
    if (
      dateSchema.safeParse(input.startDate).success &&
      (!input.timezone || timezoneSchema.safeParse(input.timezone).success) &&
      input.startDate < calendarDate(now, input.timezone ?? "UTC")
    )
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Start date must be today or later in your timezone.",
      });
  });
}

export const activitySchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(400),
  category: z.enum(INTERESTS),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().positive().max(720),
  estimatedCost: z.number().finite().nonnegative().max(1_000_000_000),
});
export const budgetAssessmentSchema = z.object({
  status: z.enum(["reasonable", "tight", "unrealistic", "uncertain"]),
  explanation: z.string().min(1).max(600),
});
export const additionalCostsSchema = z.object({
  accommodation: z.number().finite().nonnegative().max(1_000_000_000),
  localTransport: z.number().finite().nonnegative().max(1_000_000_000),
  additionalMeals: z.number().finite().nonnegative().max(1_000_000_000),
});
export const itinerarySchema = z
  .object({
    id: z.uuid(),
    source: z.enum(["mock", "ai"]),
    createdAt: z.iso.datetime(),
    input: tripInputSchema,
    overview: z.string().min(1).max(800).optional(),
    assumptions: z.array(z.string().min(1).max(300)).max(8).default([]),
    warnings: z.array(z.string().min(1).max(400)).max(8).default([]),
    budgetAssessment: budgetAssessmentSchema.optional(),
    days: z
      .array(
        z.object({
          id: z.string().min(1).max(200),
          number: z.number().int().positive(),
          date: dateSchema,
          title: z.string().min(1).max(120),
          activities: z.array(activitySchema).min(0).max(4),
          additionalCosts: additionalCostsSchema.optional(),
        }),
      )
      .min(1)
      .max(MAX_TRIP_DAYS),
  })
  .superRefine((itinerary, ctx) => {
    if (!tripInputSchema.safeParse(itinerary.input).success) return;
    if (
      itinerary.days.length !==
      tripDayCount(itinerary.input.startDate, itinerary.input.endDate)
    )
      ctx.addIssue({
        code: "custom",
        message: "Itinerary length does not match travel dates.",
      });
    const ids = new Set<string>([itinerary.id]);
    if (
      itinerary.source === "ai" &&
      (!itinerary.overview || !itinerary.budgetAssessment)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "AI itineraries must include an overview and budget assessment.",
      });
    }
    itinerary.days.forEach((day, index) => {
      if (ids.has(day.id))
        ctx.addIssue({
          code: "custom",
          message: "Day and activity IDs must be unique.",
        });
      ids.add(day.id);
      if (itinerary.source === "ai" && !day.additionalCosts)
        ctx.addIssue({
          code: "custom",
          message: "AI days must include cost estimates.",
        });
      const expected = new Date(
        Date.parse(`${itinerary.input.startDate}T00:00:00Z`) +
          index * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);
      if (day.number !== index + 1 || day.date !== expected)
        ctx.addIssue({
          code: "custom",
          message: "Itinerary days must follow travel dates in order.",
        });
      try {
        if (!scheduleWithinWindow(itinerary.input, day.date, day.activities))
          ctx.addIssue({
            code: "custom",
            message:
              "Activities conflict with airport travel constraints, or an ordinary day is empty.",
          });
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Invalid travel schedule metadata.",
        });
      }
      let previousEnd = 0;
      day.activities.forEach((activity) => {
        const [hour, minute] = activity.time.split(":").map(Number);
        const start = hour * 60 + minute;
        if (start < previousEnd || start + activity.durationMinutes > 1440)
          ctx.addIssue({
            code: "custom",
            message:
              "Activities must be ordered, non-overlapping, and finish within the day.",
          });
        previousEnd = start + activity.durationMinutes;
        if (ids.has(activity.id))
          ctx.addIssue({
            code: "custom",
            message: "Activity IDs must be unique.",
          });
        ids.add(activity.id);
      });
    });
  });
