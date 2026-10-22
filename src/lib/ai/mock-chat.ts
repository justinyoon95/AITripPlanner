import type { EditRequest } from "@/features/trips/edit-schema";
import type { AIChatOutput, AIEditOutput } from "./edit-output-schema";
import { factualQuestion } from "./chat-policy";
import { contextualRequest } from "./conversation-context";

export function mockChat(
  request: EditRequest,
  edit: (request: EditRequest) => AIEditOutput,
): AIChatOutput {
  const text = contextualRequest(request);
  const dayNumber =
    Number([...text.matchAll(/\bday\s+(\d+)\b/gi)].at(-1)?.[1]) || null;
  if (
    /^(?:on\s+)?day\s+\d+[.!]?$/i.test(request.message.trim()) &&
    !factualQuestion(text)
  )
    return {
      kind: "clarification",
      intent: "clarification_needed",
      operations: [],
      question: null,
      message: `What would you like to change about Day ${dayNumber}: fewer activities, a replacement, or a different time?`,
    };
  const question = (
    type: NonNullable<AIChatOutput["question"]>["type"],
    amount: number | null = null,
  ): AIChatOutput => ({
    intent: "travel_question",
    kind: "answer",
    message: "Sample response interpreted from your current itinerary.",
    operations: [],
    question: {
      type,
      dayNumber,
      amount,
      currency: request.itinerary.input.currency,
    },
  });
  if (
    /\bif\b|will I exceed/i.test(text) &&
    /spend|budget|another|additional/i.test(text)
  ) {
    const amount = Number(
      text.match(/(?:another|additional|extra|spend)\s+\$?([\d.]+)/i)?.[1],
    );
    return question("budget_delta", Number.isFinite(amount) ? amount : null);
  }
  if (/food|meals/i.test(text) && /how much|cost|spend|estimate/i.test(text))
    return question("food_cost");
  if (/per person|each person|per traveler/i.test(text))
    return question("per_person_cost");
  if (/most expensive|highest.*cost/i.test(text))
    return question("most_expensive_day");
  if (/remaining|budget.*left|left.*budget/i.test(text))
    return question("budget_remaining");
  if (/over budget/i.test(text)) return question("budget_status");
  if (
    /one person or|both travelers|cost.*scope/i.test(text) &&
    !/how much/i.test(text)
  )
    return question("cost_scope");
  if (/how much|total|estimated spending|budget summary/i.test(text))
    return question(dayNumber ? "day_cost" : "trip_cost");
  if (/schedule|what.*planned/i.test(text)) return question("schedule");
  if (/my preferences|my interests|my pace/i.test(text))
    return question("preferences");
  if (factualQuestion(text))
    return { ...question("trip_cost"), question: null };
  if (/culture|etiquette|currency|customs|tipping|polite/i.test(text))
    return {
      ...question("preferences"),
      question: null,
      message:
        "Sample advice: learn local etiquette, ask respectfully when unsure, and check current official guidance. This is general, unverified travel advice.",
    };
  if (/^(?:what|why|how|is |are |if )/i.test(text))
    return {
      intent: "clarification_needed",
      kind: "clarification",
      message:
        "Sample mode: specify an itinerary estimate, cultural question, or targeted activity change.",
      operations: [],
      question: null,
    };
  const resolved =
    /(?:fewer|less)\s+(?:events|activities)|relax(?:ed|ing)/i.test(text)
      ? `Make Day ${dayNumber ?? 1} less busy`
      : text;
  const result = edit({ ...request, message: resolved });
  return {
    ...result,
    intent:
      result.kind === "proposal" ? "itinerary_edit" : "clarification_needed",
    question: null,
  };
}
