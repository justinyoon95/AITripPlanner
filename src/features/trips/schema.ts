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
          activities: z.array(activitySchema).min(1).max(4),
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
        Date.parse(`${itinerary.input.startDate}T00:00:00Z`) + index * DAY_MS,
      )
        .toISOString()
        .slice(0, 10);
      if (day.number !== index + 1 || day.date !== expected)
        ctx.addIssue({
          code: "custom",
          message: "Itinerary days must follow travel dates in order.",
        });
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
