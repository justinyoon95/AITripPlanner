import type { ChatIntent } from "./chat-contract";

export function hasExplicitUncertainty(text: string) {
  return /\b(?:cannot|can't|unable to)\s+(?:reliably\s+)?(?:verify|confirm|check)|\b(?:not|haven't|have not)\s+(?:been\s+)?(?:verified|checked|consulted)|\bno (?:live|external|verified) (?:information|sources|data)|\b(?:don't have|do not have|lack)\s+(?:specific|verified|current|live)\s+(?:information|details)|\bunverified\b/i.test(
    text,
  );
}

// Disclosure in an informational answer already does the warning's job. New
// recommendations and proposals retain a notice even when other facts are unknown.
export function shouldShowUncertaintyNotice(message: {
  evidence?: string;
  intent?: ChatIntent;
  status?: string;
  content: string;
}) {
  if (message.evidence !== "unverified_suggestion") return false;
  if (
    message.intent === "itinerary_edit" ||
    ["proposed", "accepted", "rejected"].includes(message.status ?? "")
  )
    return true;
  const recommendation =
    /\b(?:recommend|suggest|consider|try|visit|explore)\s+(?!(?:checking|confirming|verifying|the official|its official|their official)\b)/i.test(
      message.content,
    );
  return recommendation || !hasExplicitUncertainty(message.content);
}
