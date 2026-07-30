import { z } from "zod";

import { MAX_TRIP_DAYS, isWithinTripLengthLimit } from "@/lib/utils/dates";
import { dollarsToCents } from "@/lib/utils/money";

export const travelStyles = [
  "RELAXED",
  "ADVENTURE",
  "CULTURE",
  "FOODIE",
  "NIGHTLIFE",
  "FAMILY",
  "LUXURY",
  "BUDGET",
] as const;

export const tripInputSchema = z
  .object({
    destination: z.string().trim().min(2).max(100),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    budget: z.coerce.number().positive().max(100_000),
    interests: z
      .array(z.string().trim().min(1).max(40))
      .min(1)
      .max(8),
    travelStyle: z.enum(travelStyles),
  })
  .superRefine((input, context) => {
    if (input.endDate < input.startDate) {
      context.addIssue({
        code: "custom",
        message: "End date must be on or after start date.",
        path: ["endDate"],
      });
    }

    if (!isWithinTripLengthLimit(input.startDate, input.endDate)) {
      context.addIssue({
        code: "custom",
        message: `Trips can be at most ${MAX_TRIP_DAYS} days for the MVP.`,
        path: ["endDate"],
      });
    }
  });

export const normalizedTripInputSchema = tripInputSchema.transform((input) => ({
  ...input,
  budgetCents: dollarsToCents(input.budget),
}));

export const tripFormSchema = z.object({
  destination: z.string().trim().min(2).max(100),
  startDate: z.string().min(1, "Start date is required."),
  endDate: z.string().min(1, "End date is required."),
  budget: z.number().positive().max(100_000),
  interestsText: z.string().trim().min(1, "Add at least one interest."),
  travelStyle: z.enum(travelStyles),
});

export function parseTripFormInput(input: TripFormInput) {
  return tripInputSchema.parse({
    destination: input.destination,
    startDate: input.startDate,
    endDate: input.endDate,
    budget: input.budget,
    interests: input.interestsText
      .split(",")
      .map((interest) => interest.trim())
      .filter(Boolean),
    travelStyle: input.travelStyle,
  });
}

export type TripInput = z.input<typeof tripInputSchema>;
export type ValidatedTripInput = z.output<typeof tripInputSchema>;
export type NormalizedTripInput = z.output<typeof normalizedTripInputSchema>;
export type TripFormInput = z.infer<typeof tripFormSchema>;
