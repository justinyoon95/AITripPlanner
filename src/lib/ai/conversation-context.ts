import type { EditRequest } from "@/features/trips/edit-schema";

const content = (text: string) => text.replace(/^\[[\w_]+\]\s*/, "");
const clarification = (text: string) => {
  const status = text.match(/^\[([\w_]+)\]/)?.[1];
  if (status) return status === "clarification";
  return /^(?:what (?:would|amount|day)|which |would you (?:like|prefer)|please (?:specify|confirm|choose))/i.test(
    content(text),
  );
};

export const informationalQuestion = (text: string) =>
  /^(?:what|why|when|where|how|is |are |if |will |does |do |which |can I |should )/i.test(
    content(text).trim(),
  );
const fragment = (text: string) =>
  text.length <= 120 &&
  !informationalQuestion(text) &&
  !/\b(?:replace|remove|delete|add|move|reschedule|swap|change|shift|reduce|increase|ignore|reveal|solve|write|make|want|fewer|less|more|relaxing)\b/i.test(
    text,
  ) &&
  /^[\p{L}\p{N}\s.,'’$€£¥₩-]+$/u.test(text);

// Only adjacent question/clarification exchanges can supply a fragment's topic.
// Completed proposals stop resolution; context never authorizes acceptance.
export function contextualRequest(request: EditRequest): string {
  const latest = request.message.normalize("NFKC").trim();
  if (
    latest.length > 120 ||
    /^(?:what|why|when|where|how|is |are |if |will |should |ignore|reveal)/i.test(
      latest,
    ) ||
    (!fragment(latest) &&
      !/^(?:day\s+\d|fewer|less|more|relax|shopping|food|nature|culture|nightlife|\$|USD|CAD|EUR|GBP|JPY|KRW|\d|just|overall|itinerary change)/i.test(
        latest,
      ))
  )
    return latest;
  const users: string[] = [];
  const history = request.context;
  let index = history.length - 1;
  const budgetConfirmation =
    /^(?:just (?:an? )?(?:overall|total) budget|overall|[$€£¥₩]|\d|USD|CAD|EUR|GBP|JPY|KRW)/i.test(
      latest,
    );
  let questionContinuation = fragment(latest);
  while (
    index >= 1 &&
    history[index].role === "assistant" &&
    (clarification(history[index].content) ||
      (questionContinuation &&
        history[index].intent !== "itinerary_edit" &&
        !/^\[(?:accepted|rejected|proposed|failed|interrupted)\]/.test(
          history[index].content,
        ) &&
        (history[index].intent === "travel_question" ||
          /^\[answered\]/.test(history[index].content)) &&
        (informationalQuestion(history[index - 1].content) ||
          fragment(content(history[index - 1].content)))) ||
      (budgetConfirmation &&
        /^\[answered\] Changing the trip's budget is not supported/.test(
          history[index].content,
        )))
  ) {
    const previous = history[index - 1];
    if (previous.role !== "user") break;
    users.unshift(content(previous.content));
    if (questionContinuation && informationalQuestion(previous.content)) break;
    questionContinuation =
      questionContinuation &&
      (informationalQuestion(previous.content) ||
        fragment(content(previous.content)));
    index -= 2;
  }
  return [...users, latest].join("\n");
}
