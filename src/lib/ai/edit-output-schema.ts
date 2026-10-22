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

// Required action decision, within a root object (not a top-level anyOf).
// A proposal cannot omit operations; clarification must name genuinely missing data.
export const conversationActionSchema = z.union([
  z.strictObject({
    type: z.literal("proposal"),
    operations: z.array(wireOperation).min(1).max(MAX_EDIT_OPERATIONS),
  }),
  z.strictObject({
    type: z.literal("clarification"),
    missing: z.enum([
      "day",
      "activity",
      "replacement",
      "schedule",
      "ambiguous_confirmation",
    ]),
    question: z.string().min(1).max(400),
  }),
  z.strictObject({
    type: z.literal("unsupported"),
    limitation: z.string().min(1).max(400),
  }),
  z.strictObject({
    type: z.literal("none"),
    reason: z.enum(["informational", "preference", "no_change", "boundary"]),
  }),
]);
export const providerConversationSchema = conversationOutputSchema
  .omit({ proposal: true })
  .extend({ action: conversationActionSchema });
export type ProviderConversation = z.infer<typeof providerConversationSchema>;
const providerEnvelopeSchema = providerConversationSchema.extend({
  action: z.unknown(),
  calculation: z.unknown(),
});

// Stored messages/proposals keep their existing wire contract; old mocked evals
// are still readable. Invalid new contracts never fall back to legacy parsing.
export function adaptConversationOutput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || !("action" in raw)) return raw;
  const parsed = providerEnvelopeSchema.safeParse(raw);
  if (!parsed.success || !Object.hasOwn(raw, "calculation")) return null;
  const { action: rawAction, ...rest } = parsed.data;
  const checked = conversationActionSchema.safeParse(rawAction);
  // The existing normalizer validates proposal/calculation components separately.
  // An invalid action never authorizes an edit, but must not erase valid arithmetic.
  if (!checked.success) return { ...rest, proposal: { invalidAction: true } };
  const action = checked.data;
  if (action.type === "clarification")
    return {
      ...rest,
      presentation: "clarification",
      message: action.question,
      proposal: null,
    };
  if (action.type === "unsupported")
    return {
      ...rest,
      presentation: "response",
      message: action.limitation,
      proposal: null,
    };
  return {
    ...rest,
    proposal:
      action.type === "proposal" ? { operations: action.operations } : null,
  };
}

// Derived display/diagnostic labels are not model intent gates.
export function observationForLegacyMetrics(raw: unknown): unknown {
  const parsed = conversationOutputSchema.safeParse(
    adaptConversationOutput(raw),
  );
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
