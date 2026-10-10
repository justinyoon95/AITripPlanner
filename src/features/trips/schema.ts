import { z } from "zod";

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
export const DAY_MS = 86_400_000;

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Choose a valid calendar date.");

export function tripDayCount(start: string, end: string) {
  return (
    Math.round(
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
        DAY_MS,
    ) + 1
  );
}

export const tripInputSchema = z
  .object({
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
  });

export const activitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(INTERESTS),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().positive(),
  estimatedCost: z.number().finite().nonnegative(),
});
export const itinerarySchema = z
  .object({
    id: z.uuid(),
    source: z.literal("mock"),
    createdAt: z.iso.datetime(),
    input: tripInputSchema,
    days: z
      .array(
        z.object({
          number: z.number().int().positive(),
          date: dateSchema,
          title: z.string(),
          activities: z.array(activitySchema).min(1).max(4),
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
    const ids = new Set<string>();
    itinerary.days.forEach((day, index) => {
      const expected = new Date(
        Date.parse(`${itinerary.input.startDate}T00:00:00Z`) + index * DAY_MS,
      )
        .toISOString()
        .slice(0, 10);
      if (day.number !== index + 1 || day.date !== expected)
        ctx.addIssue({
          code: "custom",
          message: "Itinerary days must follow travel dates in order.",
        });
      day.activities.forEach((activity) => {
        if (ids.has(activity.id))
          ctx.addIssue({
            code: "custom",
            message: "Activity IDs must be unique.",
          });
        ids.add(activity.id);
      });
    });
  });
