import { unsupportedClaim } from "./claim-policy";
import { conversationDiagnostic } from "./conversation-diagnostics";

const unsupportedTotals =
  /\b(?:total|remaining budget|budget remaining|overrun|exceeds.{0,15}budget|day\s+\d+.{0,20}(?:cost|spending)|(?:cost|spending).{0,20}day\s+\d+)\b[^.!?\n]{0,50}[$€£¥₩\d]/i;

// Financial commentary is replaced by server arithmetic only AFTER a calculation
// succeeds. This controls model output, not natural-language intent routing.
export function calculationCommentary(message: string) {
  return message
    .split(/(?<=[.!?])\s+|\n/)
    .filter(
      (sentence) =>
        !/\d|[$€£¥₩]|\b(?:cost|spend|spending|spent|budget|total|figure|estimate|estimated|calculate|calculation|validated|person|travelers|USD|CAD|EUR|GBP|JPY|KRW)\b/i.test(
          sentence,
        ),
    )
    .join(" ");
}

// Output-only presentation control, not interpretation or authorization of users.
// A chat response can prepare a draft, but cannot report a committed mutation.
export function safeActionMessage(message: string, hasProposal: boolean) {
  const sentences = message.split(/(?<=[.!?])\s+|\n/);
  const claims =
    /\b(?:I|we)\s+(?:(?:have|I've|we've)\s+|will\s+|am\s+|are\s+)?(?:added|removed|replaced|rescheduled|updated|changed|add|remove|replace|reschedule|update|enhance)\b|\b(?:I've|we've)\s+(?:added|removed|replaced|updated|changed)\b|\b(?:your\s+)?(?:itinerary|schedule|plan)\s+(?:has been|is now|was)\s+(?:updated|changed|modified)\b/i;
  const safe = sentences.filter((sentence) => !claims.test(sentence));
  if (safe.length === sentences.length) return message;
  conversationDiagnostic("proposal", "ACTION_NARRATION_REPLACED");
  return (
    safe.join(" ") ||
    (hasProposal
      ? "Review the proposed change below."
      : "No reviewable change was prepared. Your itinerary is unchanged; please specify the change you want to review.")
  );
}

// The fallback is about the rejected assertion, not keyword routing of user intent.
export function safeConversationMessage(message: string) {
  const sentences = message.split(/(?<=[.!?])\s+|\n/);
  const rejected = sentences.filter(
    (sentence) =>
      unsupportedClaim(sentence) || unsupportedTotals.test(sentence),
  );
  if (!rejected.length) return message;
  conversationDiagnostic("factual", "UNSUPPORTED_ASSERTION_REPLACED");
  const safe = sentences.filter((sentence) => !rejected.includes(sentence));
  const assertions = rejected.join(" ");
  const limitation = /\b(?:hours|open|opens|close|closes|closing)\b/i.test(
    assertions,
  )
    ? "Opening and closing times depend on the branch and date. I can't verify business hours without live information; check the specific venue's official guidance before planning around it."
    : /\b(?:travel|transit|route|walk|walking|minutes|away)\b/i.test(assertions)
      ? "This may be a useful option, but I can't verify its proximity or travel time. Check the route before fitting it into your plans."
      : unsupportedTotals.test(assertions)
        ? "I can calculate estimates from your current itinerary, but that figure was not a validated calculation."
        : "I can't verify those venue details without external information. Treat recommendations as suggestions and check official guidance where relevant.";
  const useful = safe.join(" ").slice(0, 700 - limitation.length - 1);
  return [useful, limitation].filter(Boolean).join(" ");
}
