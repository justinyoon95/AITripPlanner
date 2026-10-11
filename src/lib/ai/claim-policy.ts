import { GenerationError } from "./errors";

// This detects specific unsupported assertions, not factual truth or every paraphrase.
const assertions = [
  /\b(?:festival|event|market|celebration|oktoberfest)\b.{0,70}\b(?:confirmed|guaranteed|takes place|will take place|tickets cost|admission is)\b/i,
  /\b(?:I|we)\s+(?:have\s+)?(?:searched|checked|verified|confirmed)\b/i,
  /\b(?:verified|confirmed|guaranteed)\s+(?:price|opening|availability|accessible|accessibility|route|booking)/i,
  /\b(?:has|holds|awarded|boasts|rated)\b.{0,35}\b(?:michelin|stars?|rating)/i,
  /\b(?:is|are)\s+(?:fully\s+)?wheelchair accessible\b/i,
  /\b(?:is|are)\s+open\s+(?:today|tonight|now|daily|from|until|\d)/i,
  /\b(?:expected|likely|scheduled)\s+to\s+be\s+open\b/i,
  /\b(?:closes?|opens?)\s+(?:at|by|around|daily at)\s*(?:\d|noon|midnight)/i,
  /\b(?:photography|photos?|food|drinks?|bags?)\s+(?:is|are)\s+(?:not\s+)?(?:allowed|permitted|prohibited|banned)\b/i,
  /\b(?:tickets?|tables?|reservations?)\s+(?:is|are)\s+(?:available|guaranteed)\b/i,
  /\b(?:allows|permits|prohibits|bans)\s+(?:flash\s+)?(?:photography|photos|food|drinks)\b/i,
  /\b(?:without|no|zero)\s+(?:any\s+)?(?:extra|additional)\s+(?:travel|transit|journey)\s+time\b/i,
  /\b(?:only|exactly)\s+\d+\s*(?:minutes?|mins?)\s+(?:away|by|walk|walking)\b/i,
];
// Negation never makes credential-like output, invented provenance or instruction
// overrides safe to echo.
const prohibitedOutput = [
  /\b(?:source|citation|place_id|verified_at)\s*:/i,
  /https?:\/\//i,
  /\bsk-(?:proj-|svcacct-)?[\w-]{15,}/i,
  /ignore (?:all )?(?:previous|system) instructions|reveal (?:your )?(?:api key|system prompt)/i,
];
export function unsupportedClaim(text: string) {
  if (prohibitedOutput.some((pattern) => pattern.test(text))) return true;
  return text.split(/(?<=[.!?])\s+|\n/).some((sentence) => {
    return assertions.some((pattern) => {
      return [
        ...sentence.matchAll(new RegExp(pattern.source, `${pattern.flags}g`)),
      ].some(
        (match) =>
          !/\b(?:not|no|never)\s+$/i.test(sentence.slice(0, match.index)) &&
          !/\b(?:cannot|can't|couldn't|unable to)\s+(?:verify|confirm|check|tell)\b[^;.!?]*\b(?:whether|if)\s+[^;.!?]*$/i.test(
            sentence
              .slice(0, match.index)
              .split(/\bbut\b/i)
              .at(-1) ?? "",
          ),
      );
    });
  });
}
export function assertSupportedClaims(value: unknown) {
  if (typeof value === "string" && unsupportedClaim(value))
    throw new GenerationError(
      "UNSUPPORTED_CLAIM",
      "The AI made an unsupported verification claim. No changes were saved. Try a simpler request; travel details still need independent verification.",
      422,
    );
  if (Array.isArray(value)) value.forEach(assertSupportedClaims);
  else if (value && typeof value === "object")
    Object.values(value).forEach(assertSupportedClaims);
}
