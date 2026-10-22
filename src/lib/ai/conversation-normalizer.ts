import type { EditRequest, EditResponse } from "@/features/trips/edit-schema";
import { EditError } from "@/features/trips/edit-schema";
import { answerTravelQuestion } from "@/features/trips/travel-questions";
import { formatMoney } from "@/features/trips/format";
import { summarizeCosts, summarizeDayCosts } from "@/features/trips/costs";
import {
  conversationOutputSchema,
  adaptConversationOutput,
} from "./edit-output-schema";
import { GenerationError } from "./errors";
import { assertSupportedClaims } from "./claim-policy";
import { securityBoundary } from "./chat-policy";
import { z } from "zod";
import {
  questionSchema,
  type TravelQuestion,
} from "@/features/trips/chat-contract";
import {
  safeConversationMessage,
  safeActionMessage,
  calculationCommentary,
} from "./conversation-facts";
import { conversationDiagnostic } from "./conversation-diagnostics";

const envelopeSchema = conversationOutputSchema.extend({
  proposal: z.unknown(),
  calculation: z.unknown(),
});

function compose(commentary: string, details: string[]) {
  // Reserve space for each independent result, including the acceptance footer.
  // Long preference/schedule descriptions must not erase a valid edit or sum.
  let available = 1000 - Math.max(0, details.length - 1) * 2;
  const bounded = details.map((part, index) => {
    const reserve = details
      .slice(index + 1)
      .reduce((sum, item) => sum + Math.min(item.length, 250), 0);
    const limit = Math.max(0, available - reserve);
    const value =
      part.length <= limit
        ? part
        : `${part.slice(0, Math.max(0, limit - 3))}...`;
    available -= value.length;
    return value;
  });
  const suffix = bounded.join("\n\n");
  return [commentary.slice(0, Math.max(0, 1000 - suffix.length - 2)), suffix]
    .filter(Boolean)
    .join("\n\n");
}

export async function normalizeConversation(
  raw: unknown,
  request: EditRequest,
  propose: (raw: unknown) => Promise<EditResponse>,
): Promise<EditResponse> {
  const blocked = securityBoundary(request);
  if (blocked) return blocked;
  const actionControlled = !!raw && typeof raw === "object" && "action" in raw;
  raw = adaptConversationOutput(raw);
  const parsed = envelopeSchema.safeParse(raw);
  if (
    !parsed.success ||
    !Object.hasOwn(raw as object, "proposal") ||
    !Object.hasOwn(raw as object, "calculation")
  ) {
    conversationDiagnostic("schema", "INVALID_ENVELOPE");
    throw new GenerationError(
      "INVALID_AI_RESPONSE",
      "The assistant returned an incomplete response. Your itinerary is unchanged.",
    );
  }
  const output = parsed.data;
  const invalidBoundaryMarker =
    (output.presentation === "boundary") !== (output.boundary !== null);
  const boundaryHasActions =
    output.presentation === "boundary" &&
    (output.proposal !== null || output.calculation !== null);
  if (invalidBoundaryMarker || boundaryHasActions) {
    conversationDiagnostic(
      "schema",
      invalidBoundaryMarker
        ? "BOUNDARY_MARKER_MISMATCH"
        : "BOUNDARY_WITH_ACTIONS",
    );
    throw new GenerationError(
      "INTENT_ACTION_MISMATCH",
      "The response contained incompatible actions. Your itinerary is unchanged.",
    );
  }
  let message = safeActionMessage(
    safeConversationMessage(output.message),
    output.proposal !== null,
  );
  if (output.boundary)
    return {
      kind: "refusal",
      intent: output.boundary,
      evidence: "none",
      message,
    };
  if (
    output.presentation === "clarification" &&
    output.proposal === null &&
    output.calculation === null
  )
    return {
      kind: "clarification",
      intent: "clarification_needed",
      evidence: "none",
      message,
    };
  // Requested figures are rendered independently of the model's commentary.
  let calculation: ReturnType<typeof answerTravelQuestion> | undefined;
  let calculationQuery: TravelQuestion | undefined;
  let hypothetical = false;
  const parts: string[] = [];
  if (output.calculation !== null) {
    try {
      const query = questionSchema.safeParse(output.calculation);
      if (!query.success)
        throw new EditError(
          "INVALID_CALCULATION",
          "I couldn't interpret the calculation. Please specify the estimate you'd like.",
        );
      // A non-hypothetical query cannot authorize additional spending. Discard
      // the irrelevant field, never use it as a computed or proposed amount.
      if (query.data.type !== "budget_delta" && query.data.amount !== null) {
        conversationDiagnostic("calculation", "IRRELEVANT_AMOUNT_IGNORED");
        query.data.amount = null;
      }
      hypothetical = query.data.type === "budget_delta";
      calculation = answerTravelQuestion(request.itinerary, query.data);
      calculationQuery = query.data;
    } catch (error) {
      if (!(error instanceof EditError)) throw error;
      conversationDiagnostic("calculation", error.code);
      parts.push(`Calculation unavailable: ${error.message}`);
    }
  }
  if (calculation) {
    message = safeActionMessage(
      safeConversationMessage(calculationCommentary(output.message)),
      output.proposal !== null,
    );
    parts.push(
      `Current itinerary${hypothetical ? " - hypothetical spending only" : ""}: ${calculation.message}`,
    );
  }
  if (output.proposal === null) {
    if (output.presentation === "clarification" && !calculation)
      return {
        kind: "clarification",
        intent: "clarification_needed",
        evidence: "none",
        message: compose(message, parts),
      };
    return {
      kind: "answer",
      intent: "travel_question",
      message: compose(message, parts),
      evidence: calculation?.evidence ?? "unverified_suggestion",
    };
  }
  try {
    const proposal = conversationOutputSchema.shape.proposal.safeParse(
      output.proposal,
    );
    if (!proposal.success || !proposal.data)
      throw new EditError(
        "INVALID_PROPOSAL",
        "The proposed changes were incomplete. Please request a new proposal.",
      );
    assertSupportedClaims(proposal.data);
    const result = await propose({
      kind: "proposal",
      message,
      operations: proposal.data.operations,
    });
    if (result.kind !== "proposal")
      throw new GenerationError(
        "INVALID_AI_RESPONSE",
        "No valid proposal was returned.",
      );
    const current = summarizeCosts(request.itinerary).total;
    const candidate = summarizeCosts(result.proposal.candidate).total;
    const money = (amount: number) =>
      formatMoney(amount, request.itinerary.input.currency);
    if (calculationQuery?.type === "day_cost") {
      const day = request.itinerary.days.find(
        (item) => item.number === calculationQuery.dayNumber,
      )!;
      const proposedDay = result.proposal.candidate.days.find(
        (item) => item.id === day.id,
      )!;
      parts.push(
        `Proposed Day ${day.number} estimate: ${money(summarizeDayCosts(proposedDay).total)} (current Day ${day.number}: ${money(summarizeDayCosts(day).total)}).`,
      );
    }
    parts.push(
      "I've prepared a proposed change for your review.",
      `Proposed itinerary estimate: ${money(candidate)} (current: ${money(current)}). Nothing changes until you accept.`,
    );
    return {
      ...result,
      message: compose(
        actionControlled
          ? `Proposed changes: ${result.proposal.summary}`
          : message,
        parts,
      ),
      intent: "itinerary_edit",
      evidence: proposal.data.operations.some((op) =>
        ["add_activity", "replace_activity"].includes(op.type),
      )
        ? "unverified_suggestion"
        : "itinerary_data",
    };
  } catch (error) {
    if (!(error instanceof EditError) && !(error instanceof GenerationError))
      throw error;
    conversationDiagnostic("proposal", error.code);
    const explanation =
      error.code === "NO_CHANGE"
        ? "The proposed operations match the current itinerary, so there is no new change to review."
        : error.code === "UNSUPPORTED_CLAIM"
          ? "The proposed activity included details I can't verify. No proposal was prepared; check official venue information or request a different suggestion."
          : error.message;
    parts.push(
      `Proposal unavailable: ${explanation} Your itinerary is unchanged.`,
    );
    if (calculation)
      return {
        kind: "answer",
        intent: "travel_question",
        evidence: calculation.evidence,
        message: compose("", parts),
      };
    return {
      kind: "clarification",
      intent: "clarification_needed",
      evidence: "none",
      message: compose("", parts),
    };
  }
}
