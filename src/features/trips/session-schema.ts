import { z } from "zod";
import { itinerarySchema } from "./schema";
import { proposalSchema } from "./edit-schema";
import { canonicalJSON } from "./fingerprint";
import { chatIntentSchema, evidenceSchema } from "./chat-contract";

export const MAX_VERSIONS = 25;
export const MAX_CHAT_MESSAGES = 100;
export const chatMessageSchema = z.strictObject({
  id: z.uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(1000),
  createdAt: z.iso.datetime(),
  status: z.enum([
    "pending",
    "answered",
    "proposed",
    "accepted",
    "rejected",
    "stale",
    "failed",
    "interrupted",
    "clarification",
  ]),
  proposalId: z.uuid().nullable(),
  intent: chatIntentSchema.optional(),
  evidence: evidenceSchema.optional(),
  versionId: z.uuid().optional(),
});
export const versionSchema = z.strictObject({
  id: z.uuid(),
  parentVersionId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  summary: z.string().min(1).max(1000),
  itinerary: itinerarySchema,
});
export const sessionSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    tripId: z.uuid(),
    activeVersionId: z.uuid(),
    revision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    versions: z.array(versionSchema).min(1).max(MAX_VERSIONS),
    messages: z.array(chatMessageSchema).max(MAX_CHAT_MESSAGES),
    pendingProposal: proposalSchema.nullable(),
  })
  .superRefine((session, ctx) => {
    const versions = new Set<string>();
    const initial = session.versions[0];
    for (const version of session.versions) {
      if (
        versions.has(version.id) ||
        version.itinerary.id !== session.tripId ||
        (version.parentVersionId !== null &&
          !versions.has(version.parentVersionId)) ||
        canonicalJSON(version.itinerary.input) !==
          canonicalJSON(initial.itinerary.input)
      )
        ctx.addIssue({ code: "custom", message: "Invalid version history." });
      versions.add(version.id);
    }
    if (
      initial.parentVersionId !== null ||
      session.versions
        .slice(1)
        .some((version) => version.parentVersionId === null) ||
      !versions.has(session.activeVersionId) ||
      new Set(session.messages.map((message) => message.id)).size !==
        session.messages.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid session identity or active version.",
      });
  });
export type TripSession = z.infer<typeof sessionSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
