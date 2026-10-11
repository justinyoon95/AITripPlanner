import { unsupportedClaim } from "./claim-policy";
import { conversationDiagnostic } from "./conversation-diagnostics";

const unsupportedTotals =
  /\b(?:total|remaining budget|budget remaining|overrun|exceeds.{0,15}budget|day\s+\d+.{0,20}(?:cost|spending)|(?:cost|spending).{0,20}day\s+\d+)\b[^.!?\n]{0,50}[$€£¥₩\d]/i;

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
