import { z } from "zod";
import { chatIntentSchema, evidenceSchema } from "./chat-contract";
import {
  activitySchema,
  additionalCostsSchema,
  itinerarySchema,
} from "./schema";

export const MAX_EDIT_OPERATIONS = 6;
export const MAX_CONTEXT_MESSAGES = 8;
export const activityDraftSchema = activitySchema.omit({ id: true }).strict();
const targetId = z.string().min(1).max(200);
const existing = { dayId: targetId, activityId: targetId };
export const editOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("replace_activity"),
    ...existing,
    activity: activityDraftSchema,
  }),
  z.strictObject({ type: z.literal("remove_activity"), ...existing }),
  z.strictObject({
    type: z.literal("reschedule_activity"),
    ...existing,
    time: activitySchema.shape.time,
    durationMinutes: activitySchema.shape.durationMinutes,
  }),
  z.strictObject({
    type: z.literal("add_activity"),
    dayId: targetId,
    activity: activitySchema.extend({ id: z.uuid() }).strict(),
  }),
  z.strictObject({
    type: z.literal("update_day_costs"),
    dayId: targetId,
    costs: additionalCostsSchema.strict(),
  }),
]);
export const editOperationsSchema = z
  .array(editOperationSchema)
  .min(1)
  .max(MAX_EDIT_OPERATIONS);
export const editScopeSchema = z.strictObject({
  dayId: targetId,
  activityId: targetId.nullable(),
});
export const editRequestSchema = z.strictObject({
  itinerary: itinerarySchema,
  baseVersionId: z.uuid(),
  baseRevision: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER - 1),
  message: z
    .string()
    .trim()
    .min(1, "Describe the change you'd like.")
    .max(1000, "Use 1,000 characters or fewer."),
  scope: editScopeSchema.nullable(),
  context: z
    .array(
      z.strictObject({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(1000),
        intent: chatIntentSchema.optional(),
        id: z.uuid().optional(),
        outcome: z
          .enum([
            "answered",
            "proposed",
            "accepted",
            "rejected",
            "stale",
            "clarification",
          ])
          .optional(),
        versionId: z.uuid().optional(),
      }),
    )
    .max(MAX_CONTEXT_MESSAGES),
  // Optional for existing clients/sessions. Context only, never acceptance.
  pendingProposal: z
    .strictObject({
      id: z.uuid(),
      baseVersionId: z.uuid(),
      baseRevision: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER - 1),
      baseFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      scope: editScopeSchema.nullable(),
      operations: editOperationsSchema,
    })
    .nullable()
    .optional(),
});
export const proposalSchema = z.strictObject({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  source: z.enum(["ai", "mock"]),
  baseVersionId: z.uuid(),
  baseRevision: editRequestSchema.shape.baseRevision,
  baseFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  scope: editScopeSchema.nullable(),
  operations: editOperationsSchema,
  summary: z.string().min(1).max(1000),
  candidate: itinerarySchema,
});
export const editResponseSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("proposal"),
    message: z.string().min(1).max(1000),
    proposal: proposalSchema,
    intent: z.literal("itinerary_edit").optional(),
    evidence: evidenceSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("clarification"),
    message: z.string().min(1).max(1000),
    intent: z.literal("clarification_needed").optional(),
    evidence: evidenceSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("answer"),
    intent: z.literal("travel_question"),
    message: z.string().min(1).max(1000),
    evidence: evidenceSchema,
  }),
  z.strictObject({
    kind: z.literal("refusal"),
    intent: chatIntentSchema.extract(["out_of_scope", "unsafe_or_disallowed"]),
    message: z.string().min(1).max(1000),
    evidence: z.literal("none"),
  }),
]);
export type EditOperation = z.infer<typeof editOperationSchema>;
export type EditRequest = z.infer<typeof editRequestSchema>;
export type EditProposal = z.infer<typeof proposalSchema>;
export type EditResponse = z.infer<typeof editResponseSchema>;
export type EditScope = z.infer<typeof editScopeSchema>;

export class EditError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "EditError";
  }
}
