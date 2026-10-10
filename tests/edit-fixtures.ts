import { randomUUID } from "node:crypto";
import { generateMockItinerary } from "@/features/trips/mock-generator";
import { createSession } from "@/features/trips/versioning";
import {
  applyEditOperations,
  describeEdits,
} from "@/features/trips/edit-engine";
import { itineraryFingerprint } from "@/features/trips/fingerprint";
import type {
  EditOperation,
  EditProposal,
  EditRequest,
} from "@/features/trips/edit-schema";
import type { TripSession } from "@/features/trips/session-schema";
import { input, previewId } from "./fixtures";

export function editSession() {
  return createSession(generateMockItinerary(input, previewId));
}
export function editRequest(session = editSession()): EditRequest {
  return {
    itinerary: session.versions.find((v) => v.id === session.activeVersionId)!
      .itinerary,
    baseVersionId: session.activeVersionId,
    baseRevision: session.revision,
    message: "Make Day 2 less busy",
    scope: null,
    context: [],
  };
}
export function removeOperation(session = editSession()): EditOperation {
  const day = editRequest(session).itinerary.days[1];
  return {
    type: "remove_activity",
    dayId: day.id,
    activityId: day.activities.at(-1)!.id,
  };
}
export async function withProposal(
  session = editSession(),
  operations = [removeOperation(session)],
): Promise<TripSession> {
  const request = editRequest(session);
  const proposal: EditProposal = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    source: "mock",
    baseVersionId: session.activeVersionId,
    baseRevision: session.revision,
    baseFingerprint: await itineraryFingerprint(request.itinerary),
    scope: null,
    operations,
    candidate: applyEditOperations(request.itinerary, operations),
    summary: describeEdits(request.itinerary, operations),
  };
  return {
    ...session,
    pendingProposal: proposal,
    messages: [
      ...session.messages,
      {
        id: randomUUID(),
        role: "assistant",
        content: "Review these changes.",
        createdAt: proposal.createdAt,
        status: "proposed",
        proposalId: proposal.id,
      },
    ],
  };
}
