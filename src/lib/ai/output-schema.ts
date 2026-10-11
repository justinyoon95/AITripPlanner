import { z } from "zod";
import { INTERESTS, MAX_TRIP_DAYS } from "@/features/trips/schema";
import type { TripInput } from "@/features/trips/types";
import { generationRequirements } from "./generation-requirements";

// Use a JSON-schema-compatible wire contract; domain refinements run after parsing.
const estimate = z.number().min(0).max(1_000_000_000);
export const aiOutputSchema = z.object({
  overview: z.string().min(1).max(800),
  assumptions: z.array(z.string().min(1).max(300)).max(8),
  warnings: z.array(z.string().min(1).max(400)).max(8),
  budgetAssessment: z.object({
    status: z.enum(["reasonable", "tight", "unrealistic", "uncertain"]),
    explanation: z.string().min(1).max(600),
  }),
  days: z
    .array(
      z.object({
        number: z.number().int().min(1).max(MAX_TRIP_DAYS),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        title: z.string().min(1).max(120),
        additionalCosts: z.object({
          accommodation: estimate,
          localTransport: estimate,
          additionalMeals: estimate,
        }),
        activities: z
          .array(
            z.object({
              name: z.string().min(1).max(120),
              description: z.string().min(1).max(400),
              category: z.enum(INTERESTS),
              time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
              durationMinutes: z.number().int().min(1).max(720),
              estimatedCost: estimate,
            }),
          )
          .min(0)
          .max(4),
      }),
    )
    .min(1)
    .max(MAX_TRIP_DAYS),
});

export function aiOutputSchemaForTrip(input: TripInput) {
  const required = generationRequirements(input);
  const day = aiOutputSchema.shape.days.element;
  return aiOutputSchema.extend({
    days: z
      .array(
        day.extend({
          number: z.number().int().min(1).max(required.dayCount),
          date: z.enum(required.days.map((item) => item.date)),
          activities:
            input.travel?.arrival?.date || input.travel?.departure?.date
              ? day.shape.activities
              : day.shape.activities.length(required.activitiesPerDay),
        }),
      )
      .length(required.dayCount),
  });
}
