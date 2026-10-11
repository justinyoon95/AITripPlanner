import type { EditRequest } from "@/features/trips/edit-schema";
import type { ConversationOutput } from "./edit-output-schema";
import { mockChat } from "./mock-chat";
import { mockEdit } from "./mock-editor";
import { requestBoundary, factualQuestion, factualAnswer } from "./chat-policy";
import { contextualRequest } from "./conversation-context";

// Deterministic demo fixtures, deliberately not a natural-language model substitute.
export function mockConversation(request: EditRequest): ConversationOutput {
  const legacy = {
    ...request,
    context: request.context.map((item) => ({
      ...item,
      content: item.outcome
        ? `[${item.outcome}] ${item.content}`
        : item.content,
    })),
  };
  const response = (message: string): ConversationOutput => ({
    message,
    presentation: "response",
    boundary: null,
    proposal: null,
    calculation: null,
  });
  if (request.pendingProposal && /flexible/i.test(request.message)) {
    return {
      ...response(
        "Sample revised proposal: allow a shorter optional stop. Nothing has been saved.",
      ),
      proposal: {
        operations: request.pendingProposal.operations.map((operation) => {
          if (
            operation.type !== "add_activity" &&
            operation.type !== "replace_activity"
          )
            return operation;
          const { id: _id, ...activity } =
            operation.type === "add_activity"
              ? operation.activity
              : { ...operation.activity, id: null };
          void _id;
          return {
            ...operation,
            activity: {
              ...activity,
              description:
                "A flexible optional stop; venue details are unverified.",
              durationMinutes: 15,
            },
          };
        }),
      },
    };
  }
  const boundary = requestBoundary(legacy);
  if (boundary)
    return {
      ...response(boundary.message.slice(0, 700)),
      presentation:
        boundary.kind === "refusal"
          ? "boundary"
          : boundary.kind === "clarification"
            ? "clarification"
            : "response",
      boundary: boundary.kind === "refusal" ? boundary.intent : null,
    };
  if (
    /\b(?:love|prefer|sounds interesting|would like to visit)\b/i.test(
      request.message,
    )
  )
    return response(
      "Sample advice: that preference can help shape your trip. Would you like a recommendation, or shall I propose a change to a specific day?",
    );
  if (factualQuestion(contextualRequest(legacy)))
    return response(factualAnswer(legacy).message);
  if (
    /which.*(?:branch|shopping area)|worth visiting|what.*(?:at night|think about)/i.test(
      request.message,
    )
  )
    return response(
      "Sample recommendation: favor an area near your planned activities and leave time to explore. Locations and travel times are unverified; real AI mode provides contextual advice.",
    );
  const day = request.itinerary.days.find(
    (item) =>
      item.number === Number(request.message.match(/day\s+(\d+)/i)?.[1]),
  );
  if (
    /shopping/i.test(request.message) &&
    /add|want to do/i.test(request.message) &&
    day
  ) {
    if (day.activities.length >= 4)
      return {
        ...response(
          "This day already has four activities. Would you like to replace one instead?",
        ),
        presentation: "clarification",
      };
    return {
      ...response(
        "Sample proposal: add an evening shopping stop; verify real shops before traveling.",
      ),
      proposal: {
        operations: [
          {
            type: "add_activity",
            dayId: day.id,
            activity: {
              name: "Sample evening shopping",
              description:
                "An illustrative shopping stop, not a verified venue.",
              category: "Shopping",
              time: "22:00",
              durationMinutes: 30,
              estimatedCost: 10,
            },
          },
        ],
      },
    };
  }
  const old = mockChat(legacy, mockEdit);
  return {
    ...response(old.message.slice(0, 700)),
    presentation: old.kind === "clarification" ? "clarification" : "response",
    proposal: old.kind === "proposal" ? { operations: old.operations } : null,
    calculation: old.question
      ? old.question.type === "budget_delta"
        ? { ...old.question, type: "budget_delta" }
        : { ...old.question, type: old.question.type, amount: null }
      : null,
  };
}
