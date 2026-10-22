import { z } from "zod";
import { dateSchema, timeSchema, timezoneSchema } from "./calendar";

const text = (length: number) =>
  z
    .string()
    .trim()
    .max(length)
    .refine(
      (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
      "Remove control characters.",
    );
export const destinationSchema = z.strictObject({
  id: z.string().regex(/^\d{1,10}$/),
  name: text(200),
  region: text(200),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  country: text(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: timezoneSchema,
});
export type Destination = z.infer<typeof destinationSchema>;
export const airportSchema = z.strictObject({
  code: z.string().regex(/^[A-Z]{3}$/),
  name: text(200),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  timezone: timezoneSchema,
});
export type Airport = z.infer<typeof airportSchema>;
export const flightSchema = z.strictObject({
  number: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^(?:[A-Z0-9]{2}|[A-Z]{3})\s?\d{1,4}[A-Z]?$/,
      "Use a flight reference such as AC123.",
    )
    .optional(),
  date: dateSchema.optional(),
  time: timeSchema.optional(),
  airportCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a three-letter airport code, such as KIX.")
    .optional(),
  airport: airportSchema.optional(),
});
export const accommodationSchema = z.strictObject({
  name: text(200).optional(),
  location: text(400).optional(),
  checkInDate: dateSchema.optional(),
  checkInTime: timeSchema.optional(),
  checkOutDate: dateSchema.optional(),
  checkOutTime: timeSchema.optional(),
  // Legacy time fields above remain unclassified; never infer a movement from them.
  checkInAvailableFrom: timeSchema.optional(),
  checkOutBy: timeSchema.optional(),
  plannedHotelArrivalDate: dateSchema.optional(),
  plannedHotelArrivalTime: timeSchema.optional(),
  plannedHotelDepartureDate: dateSchema.optional(),
  plannedHotelDepartureTime: timeSchema.optional(),
});
export const travelSchema = z.strictObject({
  arrival: flightSchema.optional(),
  departure: flightSchema.optional(),
  accommodation: accommodationSchema.optional(),
});
export const seasonalSchema = z.enum(["include", "prioritize", "exclude"]);
export type TravelDetails = z.infer<typeof travelSchema>;
export const MAX_TRAVELERS = 10; // Small-party planning, not group-tour allocation.
