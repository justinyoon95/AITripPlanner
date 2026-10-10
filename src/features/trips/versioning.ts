import { itinerarySchema } from "./schema";
import type { Itinerary } from "./types";
import {
  MAX_VERSIONS,
  sessionSchema,
  type TripSession,
} from "./session-schema";
import { proposalSchema, EditError, type EditProposal } from "./edit-schema";
import { canonicalJSON, itineraryFingerprint } from "./fingerprint";
import { applyEditOperations, describeEdits } from "./edit-engine";

export function createSession(itinerary: Itinerary): TripSession {
  const snapshot = itinerarySchema.parse(itinerary);
  return sessionSchema.parse({
    schemaVersion: 2,
    tripId: snapshot.id,
    activeVersionId: snapshot.id,
    revision: 0,
    versions: [
      {
        id: snapshot.id,
        parentVersionId: null,
        createdAt: snapshot.createdAt,
        summary: "Original itinerary",
        itinerary: snapshot,
      },
    ],
    messages: [],
    pendingProposal: null,
  });
}
export function activeVersion(session: TripSession) {
  const version = session.versions.find(
    (item) => item.id === session.activeVersionId,
  );
  if (!version)
    throw new EditError(
      "INVALID_HISTORY",
      "The active itinerary version is missing.",
    );
  return version;
}
export async function validateProposal(
  session: TripSession,
  raw: unknown,
): Promise<EditProposal> {
  const parsed = proposalSchema.safeParse(raw);
  if (!parsed.success)
    throw new EditError(
      "INVALID_CANDIDATE",
      "The stored proposal is invalid and cannot be accepted. Please request a new proposal.",
    );
  const proposal = parsed.data;
  const base = activeVersion(session).itinerary;
  if (
    proposal.baseVersionId !== session.activeVersionId ||
    proposal.baseRevision !== session.revision ||
    proposal.baseFingerprint !== (await itineraryFingerprint(base))
  )
    throw new EditError(
      "STALE_PROPOSAL",
      "This proposal is based on an older itinerary. Please request a new proposal.",
    );
  const expected = applyEditOperations(
    base,
    proposal.operations,
    proposal.scope,
  );
  if (canonicalJSON(expected) !== canonicalJSON(proposal.candidate))
    throw new EditError(
      "INVALID_CANDIDATE",
      "The stored proposal does not match its declared changes. It cannot be accepted; please request a new proposal.",
    );
  return proposal;
}
export function invalidateProposal(session: TripSession): TripSession {
  return {
    ...session,
    pendingProposal: null,
    messages: session.messages.map((message) =>
      message.status === "proposed" ? { ...message, status: "stale" } : message,
    ),
  };
}
export async function acceptProposal(
  session: TripSession,
  proposalId: string,
  now = new Date(),
): Promise<TripSession> {
  const checked = sessionSchema.parse(session);
  if (!checked.pendingProposal || checked.pendingProposal.id !== proposalId)
    throw new EditError(
      "MISSING_PROPOSAL",
      "This proposal is no longer available.",
    );
  if (checked.versions.length >= MAX_VERSIONS)
    throw new EditError(
      "HISTORY_FULL",
      "This trip has reached its 25-version limit. Existing history is preserved; no changes were saved.",
    );
  const proposal = await validateProposal(checked, checked.pendingProposal);
  if (checked.versions.some((version) => version.id === proposal.id))
    throw new EditError(
      "DUPLICATE_VERSION",
      "This proposal has already been saved.",
    );
  return sessionSchema.parse({
    ...checked,
    activeVersionId: proposal.id,
    revision: checked.revision + 1,
    pendingProposal: null,
    versions: [
      ...checked.versions,
      {
        id: proposal.id,
        parentVersionId: checked.activeVersionId,
        createdAt: now.toISOString(),
        summary: describeEdits(
          activeVersion(checked).itinerary,
          proposal.operations,
        ),
        itinerary: proposal.candidate,
      },
    ],
    messages: checked.messages.map((message) =>
      message.proposalId === proposal.id
        ? { ...message, status: "accepted" }
        : message,
    ),
  });
}
export function restoreVersion(
  session: TripSession,
  versionId: string,
): TripSession {
  const checked = sessionSchema.parse(session);
  if (!checked.versions.some((version) => version.id === versionId))
    throw new EditError(
      "UNKNOWN_VERSION",
      "That version is no longer available.",
    );
  if (versionId === checked.activeVersionId) return checked;
  return sessionSchema.parse({
    ...invalidateProposal(checked),
    activeVersionId: versionId,
    revision: checked.revision + 1,
  });
}
export function undoVersion(session: TripSession) {
  const parent = activeVersion(session).parentVersionId;
  if (!parent)
    throw new EditError(
      "NOTHING_TO_UNDO",
      "You are viewing the original itinerary.",
    );
  return restoreVersion(session, parent);
}
