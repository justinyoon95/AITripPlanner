import { z } from "zod";
import {
  chatIntentSchema,
  questionSchema,
} from "@/features/trips/chat-contract";
import {
  activityDraftSchema,
  editOperationSchema,
  MAX_EDIT_OPERATIONS,
} from "@/features/trips/edit-schema";

// Provider-generated additions have no identity; normalization assigns UUIDs.
const wireOperation = z.union([
  editOperationSchema.options[0],
  editOperationSchema.options[1],
  editOperationSchema.options[2],
  z.strictObject({
    type: z.literal("add_activity"),
    dayId: z.string().min(1).max(200),
    activity: activityDraftSchema,
  }),
  editOperationSchema.options[4],
]);
export const aiEditOutputSchema = z.strictObject({
  kind: z.enum(["proposal", "clarification"]),
  message: z.string().min(1).max(1000),
  operations: z.array(wireOperation).max(MAX_EDIT_OPERATIONS),
});
export type AIEditOutput = z.infer<typeof aiEditOutputSchema>;

export const aiChatOutputSchema = z.strictObject({
  intent: chatIntentSchema,
  kind: z.enum(["proposal", "clarification", "answer", "refusal"]),
  message: z.string().min(1).max(1000),
  operations: z.array(wireOperation).max(MAX_EDIT_OPERATIONS),
  question: questionSchema.nullable(),
});
export type AIChatOutput = z.infer<typeof aiChatOutputSchema>;

// The old intent contract is retained for frozen evaluation fixtures only.
const calculationOutputSchema = z.union([
  z.strictObject({
    ...questionSchema.shape,
    type: questionSchema.shape.type.exclude(["budget_delta"]),
    amount: z.null(),
  }),
  z.strictObject({ ...questionSchema.shape, type: z.literal("budget_delta") }),
]);
export const conversationOutputSchema = z.strictObject({
  message: z.string().min(1).max(700),
  presentation: z.enum(["response", "clarification", "boundary"]),
  boundary: z.enum(["out_of_scope", "unsafe_or_disallowed"]).nullable(),
  proposal: z
    .strictObject({
      operations: z.array(wireOperation).min(1).max(MAX_EDIT_OPERATIONS),
    })
    .nullable(),
  calculation: calculationOutputSchema.nullable(),
});
export type ConversationOutput = z.infer<typeof conversationOutputSchema>;

// Derived display/diagnostic labels are not model intent gates.
export function observationForLegacyMetrics(raw: unknown): unknown {
  const parsed = conversationOutputSchema.safeParse(raw);
  if (!parsed.success) return raw;
  const value = parsed.data;
  const kind = value.proposal
    ? "proposal"
    : value.presentation === "boundary"
      ? "refusal"
      : value.calculation
        ? "answer"
        : value.presentation === "clarification"
          ? "clarification"
          : "answer";
  return {
    kind,
    intent: value.proposal
      ? "itinerary_edit"
      : (value.boundary ??
        (kind === "clarification"
          ? "clarification_needed"
          : "travel_question")),
    message: value.message,
    operations: value.proposal?.operations ?? [],
    question: value.calculation,
  };
}
