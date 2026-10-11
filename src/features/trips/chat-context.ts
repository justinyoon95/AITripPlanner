import type { TripSession } from "./session-schema";
import { MAX_CONTEXT_MESSAGES, type EditRequest } from "./edit-schema";

// Preserve complete chronological exchanges; metadata is context, never authority.
export function conversationContext(
  session: TripSession,
): EditRequest["context"] {
  const eligible = session.messages.filter(
    (message) => !["pending", "failed", "interrupted"].includes(message.status),
  );
  const recent = eligible.slice(-MAX_CONTEXT_MESSAGES);
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content.slice(0, 1000),
    intent: message.intent,
    outcome: message.status as NonNullable<
      EditRequest["context"][number]["outcome"]
    >,
    versionId: message.versionId,
  }));
}
