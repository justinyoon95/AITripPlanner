import { z } from "zod";

export const chatIntentSchema = z.enum([
  "itinerary_edit",
  "travel_question",
  "clarification_needed",
  "out_of_scope",
  "unsafe_or_disallowed",
]);
export type ChatIntent = z.infer<typeof chatIntentSchema>;
export const evidenceSchema = z.enum([
  "itinerary_data",
  "itinerary_estimates",
  "unverified_suggestion",
  "none",
]);
export const questionSchema = z.strictObject({
  type: z.enum([
    "trip_cost",
    "day_cost",
    "food_cost",
    "budget_delta",
    "schedule",
    "preferences",
  ]),
  dayNumber: z.number().int().min(1).max(14).nullable(),
  amount: z.number().finite().min(0).max(1_000_000_000).nullable(),
  currency: z.enum(["USD", "CAD", "EUR", "GBP", "JPY", "KRW"]).nullable(),
});
export type TravelQuestion = z.infer<typeof questionSchema>;
export const responseLabels: Record<ChatIntent, string> = {
  itinerary_edit: "Proposed changes",
  travel_question: "Answer",
  clarification_needed: "Clarification",
  out_of_scope: "Travel assistant",
  unsafe_or_disallowed: "Request boundary",
};
