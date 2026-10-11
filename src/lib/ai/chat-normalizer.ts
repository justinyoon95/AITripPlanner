import type { EditRequest, EditResponse } from "@/features/trips/edit-schema";
import { EditError } from "@/features/trips/edit-schema";
import { answerTravelQuestion } from "@/features/trips/travel-questions";
import { aiChatOutputSchema } from "./edit-output-schema";
import { GenerationError } from "./errors";
import {
  factualAnswer,
  factualQuestion,
  hasEditAuthorization,
  requestBoundary,
} from "./chat-policy";
import { assertSupportedClaims } from "./claim-policy";
import { contextualRequest } from "./conversation-context";
import { normalizeConversation } from "./conversation-normalizer";

// Compatibility for frozen fixtures, not a fallback for production provider output.
export async function normalizeChatResponse(
  raw: unknown,
  request: EditRequest,
  propose: (raw: unknown) => Promise<EditResponse>,
): Promise<EditResponse> {
  return raw && typeof raw === "object" && "presentation" in raw
    ? normalizeConversation(raw, request, propose)
    : normalizeLegacyChatResponse(raw, request, propose);
}

function questionMatchesRequest(
  request: EditRequest,
  query: NonNullable<ReturnType<typeof aiChatOutputSchema.parse>["question"]>,
) {
  const text = contextualRequest(request);
  const day = (request.message.match(/\bday\s+(\d+)\b/i) ??
    [...text.matchAll(/\bday\s+(\d+)\b/gi)].at(-1))?.[1];
  if (day && Number(day) !== query.dayNumber) return false;
  if (query.type === "budget_delta") {
    const amounts = [
      ...text.matchAll(
        /(?:another|additional|extra|spend)\s*(?:USD|CAD|EUR|GBP|JPY|KRW|[$€£¥₩])?\s*([\d,.]+)/gi,
      ),
    ];
    if (amounts.length !== 1) return false;
    const amount = amounts[0][1].replace(/[.,]$/, "");
    if (
      !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(amount) ||
      Number(amount.replaceAll(",", "")) !== query.amount ||
      /\d\s*[+*/]\s*\d/.test(text)
    )
      return false;
    const currency = text
      .match(/\b(USD|CAD|EUR|GBP|JPY|KRW)\b/i)?.[1]
      ?.toUpperCase();
    if (currency && query.currency !== currency) return false;
    if (
      text.includes("$") &&
      !currency &&
      !["USD", "CAD"].includes(request.itinerary.input.currency)
    )
      return false;
    if (text.includes("€") && query.currency !== "EUR") return false;
    if (text.includes("£") && query.currency !== "GBP") return false;
    if (text.includes("¥") && query.currency !== "JPY") return false;
    if (text.includes("₩") && query.currency !== "KRW") return false;
  }
  return true;
}

export async function normalizeLegacyChatResponse(
  raw: unknown,
  request: EditRequest,
  propose: (raw: unknown) => Promise<EditResponse>,
): Promise<EditResponse> {
  const boundary = requestBoundary(request);
  if (boundary) return boundary;
  const relevant = contextualRequest(request);
  const parsed = aiChatOutputSchema.safeParse(raw);
  if (!parsed.success)
    throw new GenerationError(
      "INVALID_AI_RESPONSE",
      "The assistant returned an invalid response. Your itinerary is unchanged.",
    );
  const result = parsed.data;
  if (
    factualQuestion(relevant) &&
    !hasEditAuthorization(request) &&
    (result.intent === "itinerary_edit" ||
      (result.intent === "clarification_needed" &&
        relevant !== request.message &&
        /change|replacement|fewer activities|different time/i.test(
          result.message,
        )))
  )
    return factualAnswer(request);
  const expected = {
    itinerary_edit: "proposal",
    travel_question: "answer",
    clarification_needed: "clarification",
    out_of_scope: "refusal",
    unsafe_or_disallowed: "refusal",
  };
  if (
    result.kind !== expected[result.intent] ||
    (result.intent !== "itinerary_edit" && result.operations.length) ||
    (result.intent !== "travel_question" && result.question !== null)
  )
    throw new GenerationError(
      "INTENT_ACTION_MISMATCH",
      "The assistant mixed incompatible response types. Your itinerary is unchanged; please ask a more specific question or edit.",
    );
  if (result.intent === "itinerary_edit") {
    if (!hasEditAuthorization(request))
      return {
        kind: "clarification",
        intent: "clarification_needed",
        evidence: "none",
        message:
          "What would you like changed about this day or activity: fewer activities, a replacement, or a different time?",
      };
    assertSupportedClaims(result);
    const proposal = await propose({
      kind: "proposal",
      message: result.message,
      operations: result.operations,
    });
    if (proposal.kind !== "proposal")
      throw new GenerationError(
        "INTENT_ACTION_MISMATCH",
        "The assistant did not produce the declared proposal. Your itinerary is unchanged.",
      );
    return {
      ...proposal,
      intent: "itinerary_edit",
      evidence: result.operations.some((op) =>
        ["replace_activity", "add_activity"].includes(op.type),
      )
        ? "unverified_suggestion"
        : "itinerary_data",
    };
  }
  if (result.intent === "travel_question") {
    if (factualQuestion(relevant)) return factualAnswer(request);
    if (
      (/etiquette/i.test(relevant) &&
        /museum|venue|institution/i.test(relevant)) ||
      /photograph|food.{0,20}polic|venue.{0,20}rules|museum.{0,20}rules/i.test(
        relevant,
      ) ||
      (/etiquette/i.test(relevant) &&
        /photograph|food|drinks|bags|polic|prohibit|permit/i.test(
          result.message,
        ))
    )
      return {
        kind: "answer",
        intent: "travel_question",
        evidence: "none",
        message:
          "General etiquette: keep your voice low, respect other visitors, follow posted signs, and ask staff when unsure. Photography, food/drink, bag and other venue policies vary; I have not checked this venue's rules. Check its official visitor guidance before your visit.",
      };
    if (result.question) {
      if (!questionMatchesRequest(request, result.question))
        return {
          kind: "clarification",
          intent: "clarification_needed",
          evidence: "none",
          message:
            "Please confirm the day, additional amount, and currency. I could not reliably match the calculation to your request; no itinerary changes were made.",
        };
      try {
        return {
          kind: "answer",
          intent: "travel_question",
          ...answerTravelQuestion(request.itinerary, result.question),
        };
      } catch (error) {
        if (error instanceof EditError)
          return {
            kind: "clarification",
            intent: "clarification_needed",
            evidence: "none",
            message: error.message,
          };
        throw error;
      }
    }
    // Numeric itinerary answers must come from deterministic code, not free prose.
    if (
      /budget|spend|cost|how much|calculate/i.test(request.message) &&
      /\d|[$€£¥₩]/.test(result.message)
    )
      return {
        kind: "clarification",
        intent: "clarification_needed",
        evidence: "none",
        message:
          "Please specify the itinerary estimate, day, or amount you want calculated. I cannot supply unsupported numbers or live currency conversions.",
      };
    assertSupportedClaims(result.message);
    return {
      kind: "answer",
      intent: "travel_question",
      evidence: "unverified_suggestion",
      message: result.message,
    };
  }
  if (result.intent === "clarification_needed") {
    assertSupportedClaims(result.message);
    return {
      kind: "clarification",
      intent: result.intent,
      evidence: "none",
      message: result.message,
    };
  }
  return {
    kind: "refusal",
    intent: result.intent,
    evidence: "none",
    message:
      result.intent === "out_of_scope"
        ? "I specialize in travel planning. Ask about your itinerary, travel preferences, cultural considerations, or estimated spending."
        : "I cannot help with that request. I can assist with safe travel questions or supported itinerary changes.",
  };
}
