export type ConversationStage =
  "schema" | "factual" | "calculation" | "proposal" | "pending_proposal";

// Codes only: never log model prose, user input, itinerary content or credentials.
export function conversationDiagnostic(stage: ConversationStage, code: string) {
  if (process.env.NODE_ENV === "development")
    console.warn("[travel-conversation]", { stage, code });
}
