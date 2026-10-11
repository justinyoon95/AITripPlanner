import type { EditRequest, EditResponse } from "@/features/trips/edit-schema";
import { MAX_CONTEXT_MESSAGES } from "@/features/trips/edit-schema";

// Sequential evaluations reuse actual replies, not invented assistant transcripts.
export function advanceContext(
  request: EditRequest,
  response?: EditResponse,
  retainProposal = false,
): EditRequest["context"] {
  if (!response) return request.context;
  return [
    ...request.context,
    { role: "user" as const, content: request.message },
    {
      role: "assistant" as const,
      content: response.message,
      outcome:
        response.kind === "proposal"
          ? retainProposal
            ? ("proposed" as const)
            : ("rejected" as const)
          : response.kind === "clarification"
            ? ("clarification" as const)
            : ("answered" as const),
    },
  ].slice(-MAX_CONTEXT_MESSAGES);
}
