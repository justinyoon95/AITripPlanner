import { readPreview } from "./storage";
import { sessionSchema, type TripSession } from "./session-schema";
import {
  createSession,
  invalidateProposal,
  validateProposal,
} from "./versioning";
import { EditError, proposalSchema } from "./edit-schema";
import { canonicalJSON } from "./fingerprint";

export const sessionKey = (id: string) => `trip-planner:session:v2:${id}`;
export function readSession(id: string): TripSession | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(sessionKey(id));
  } catch {
    throw new Error(
      "Your browser could not access this trip. Enable site storage and try again.",
    );
  }
  if (!raw) {
    const preview = readPreview(id);
    return preview ? createSession(preview) : null;
  }
  try {
    const data = JSON.parse(raw);
    const proposalValid =
      data &&
      typeof data === "object" &&
      (data.pendingProposal === null ||
        proposalSchema.safeParse(data.pendingProposal).success);
    const parsed = sessionSchema.parse(
      proposalValid ? data : { ...data, pendingProposal: null },
    );
    const session = proposalValid ? parsed : invalidateProposal(parsed);
    if (session.tripId !== id) throw new Error("Wrong identity");
    return session;
  } catch {
    throw new Error(
      "This trip's version history is damaged. No data was overwritten. Try reopening an unaffected trip.",
    );
  }
}
export async function recoverSession(
  session: TripSession,
): Promise<TripSession> {
  let next = {
    ...session,
    messages: session.messages.map((message) =>
      message.status === "pending"
        ? { ...message, status: "interrupted" as const }
        : message,
    ),
  };
  if (next.pendingProposal) {
    try {
      await validateProposal(next, next.pendingProposal);
    } catch {
      next = invalidateProposal(next);
    }
  }
  return next;
}
export function writeSession(session: TripSession) {
  const checked = sessionSchema.parse(session);
  const raw = JSON.stringify(checked);
  if (raw.length * 2 > 2 * 1024 * 1024)
    throw new EditError(
      "STORAGE_FULL",
      "This trip's local history is too large. No changes were saved.",
    );
  try {
    window.localStorage.setItem(sessionKey(checked.tripId), raw);
  } catch {
    throw new EditError(
      "STORAGE_FULL",
      "Your browser could not save this change. Enable site storage or free up space. Your current itinerary is unchanged.",
    );
  }
}

// Re-read inside a cross-tab lock, including after asynchronous fingerprint validation.
export async function updateStoredSession(
  expected: TripSession,
  update: (current: TripSession) => TripSession | Promise<TripSession>,
): Promise<TripSession> {
  const transact = async () => {
    const current = readSession(expected.tripId);
    if (!current || canonicalJSON(current) !== canonicalJSON(expected))
      throw new EditError(
        "SESSION_CONFLICT",
        "This trip changed in another tab. Reload its latest version before continuing.",
      );
    const next = await update(current);
    const latest = readSession(expected.tripId);
    if (canonicalJSON(latest) !== canonicalJSON(current))
      throw new EditError(
        "SESSION_CONFLICT",
        "This trip changed while saving. No changes were saved; reload and try again.",
      );
    writeSession(next);
    return next;
  };
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request(`trip-planner:${expected.tripId}`, transact);
  return transact();
}
