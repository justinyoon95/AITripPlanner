import type { EditRequest, EditResponse } from "@/features/trips/edit-schema";
import { contextualRequest } from "./conversation-context";

const refusal = (
  intent: "out_of_scope" | "unsafe_or_disallowed",
  message: string,
): EditResponse => ({ kind: "refusal", intent, message, evidence: "none" });
// Production conversation preflight retains only narrow security controls.
export function securityBoundary(request: Pick<EditRequest, "message">) {
  const text = request.message.normalize("NFKC");
  // Narrow, high-confidence patterns only; relevance is otherwise model-classified.
  if (
    /ignore (?:all |the |your )?(?:previous |prior |system )?instructions|you are no longer|(?:reveal|print|show|expose).{0,35}(?:system prompt|api key|server configuration|environment variables)|(?:delete|erase|clear).{0,25}(?:entire trip|trip history|all versions)|invalid activity ids?|bypass.{0,30}(?:constraint|schedule|limit)|(?:steal|forge).{0,25}(?:passport|visa)|(?:build|make).{0,20}(?:bomb|weapon)/i.test(
      text,
    )
  )
    return refusal(
      "unsafe_or_disallowed",
      "I can help with travel planning, but not override safeguards, expose private configuration, erase history, or assist harmful actions. Describe a supported itinerary change or travel question instead.",
    );
  return null;
}
// Frozen legacy policy used by historical tests and the deterministic demo only.
export function requestBoundary(
  request: Pick<EditRequest, "message"> &
    Partial<Pick<EditRequest, "itinerary" | "context">>,
): EditResponse | null {
  const blocked = securityBoundary(request);
  if (blocked) return blocked;
  const text = request.message.normalize("NFKC");
  const relevant =
    request.itinerary && request.context
      ? contextualRequest(request as EditRequest)
      : text;
  const setting = relevant.match(
    /\b(?:change|set|update|adjust|switch|modify|make)\s+(?:(?:my|the|our|this|trip's|overall|total|trip|travel|existing|entire)\s+){0,4}(budget|destination|dates?|currency)\b/i,
  );
  if (setting && !/^(?:what|how|should|if|will)\b/i.test(text.trim())) {
    const field = setting[1].toLowerCase();
    return {
      kind: "answer",
      intent: "travel_question",
      evidence: "none",
      message: `Changing the trip's ${field} is not supported in this preview. Use Plan your trip to create a new itinerary with the ${field} you want. Your current itinerary and version history are unchanged.`,
    };
  }
  const day =
    text.match(/\bday\s+(\d+)\b/i) ??
    [...relevant.matchAll(/\bday\s+(\d+)\b/gi)].at(-1);
  if (
    day &&
    request.itinerary &&
    !request.itinerary.days.some((d) => d.number === Number(day[1]))
  ) {
    return {
      kind: "clarification",
      intent: "clarification_needed",
      evidence: "none",
      message: `Day ${day[1]} is not in your current ${request.itinerary.days.length}-day itinerary. Which existing day did you mean?${factualQuestion(relevant) ? " Scheduled activity times are not opening hours. I cannot verify venue hours or availability; check the venue's official website." : ""}`,
    };
  }
  if (
    /\bsolve\b|\bwrite (?:a )?(?:program|essay)\b/i.test(text) &&
    !/trip|travel|budget|currency|spend|cost|day\s+\d|itinerary/i.test(text)
  )
    return refusal(
      "out_of_scope",
      "I specialize in travel planning. I can explain your itinerary, estimated spending, or propose a targeted activity change.",
    );
  if (
    /^(?:make|improve).{0,15}(?:itinerary|trip).{0,10}(?:better|great)|^make it better[.!]?$/i.test(
      text.trim(),
    )
  )
    return {
      kind: "clarification",
      intent: "clarification_needed",
      evidence: "none",
      message:
        "What would you like to improve: pace, activity interests, or estimated cost? Choose a day or activity so I can propose a targeted change.",
    };
  const target = text.match(
    /\b(activity|day)\s+(?:id|uuid)\s*[:=]?\s*([\w-]+)/i,
  );
  if (target && request.itinerary) {
    const ids =
      target[1].toLowerCase() === "day"
        ? request.itinerary.days.map((d) => d.id)
        : request.itinerary.days.flatMap((d) => d.activities.map((a) => a.id));
    if (!ids.includes(target[2]))
      return {
        kind: "clarification",
        intent: "clarification_needed",
        evidence: "none",
        message:
          "That explicit identifier is not in the current itinerary. Select an existing day or activity and describe the change you want.",
      };
  }
  return null;
}

export function hasEditAuthorization(request: EditRequest) {
  const text = request.message.normalize("NFKC").trim();
  // Informational questions never become edits just because history contains verbs.
  if (
    /^(?:what|why|when|where|how\b|is |are |will |if |does |do you|should |would (?!you)|could (?!you)|can (?!you))/i.test(
      text,
    )
  )
    return false;
  const edit =
    /\b(?:replace|remove|delete|add|move|reschedule|swap|change|shift|reduce|increase)\b|(?:fewer|less)\s+(?:events|activities)|less busy|more relax(?:ed|ing)|(?:want|make).{0,40}relax(?:ed|ing)|cheaper alternative|more (?:food|shopping|nature|culture|restaurants)|(?:make|plan).{0,25}(?:cheaper|relaxed|relaxing|busy|packed)/i;
  if (edit.test(text)) return true;
  const resolved = contextualRequest(request);
  return (
    resolved !== text &&
    !/^(?:what|why|when|where|how\b|is |are |will |if |does |should )/i.test(
      resolved,
    ) &&
    edit.test(resolved)
  );
}

export function factualQuestion(text: string) {
  return /opening hours|closing (?:time|hours)|\b(?:when|time|late)\b.{0,100}\b(?:close|closes|closing)\b|\b(?:is|are|will|does|when|be|remain)\b.{0,100}\bopen\b(?![- ](?:air|to)\b)|\bopen\s+(?:on|at|today|now|tonight|during|daily|from|until|tomorrow)|\bclosed\b|\bavailability\b|tickets?.{0,25}available|restaurant.{0,25}available|michelin|awards?|star rating|\bratings?\b|wheelchair|accessibility|transport(?:ation)?.{0,25}schedule|(?:train|bus|ferry).{0,25}(?:depart|arrive|timetable)|verify.{0,30}(?:place|restaurant|price|exist)|exchange rate|checked google maps/i.test(
    text,
  );
}
export const factualLimitation =
  "I have not consulted external sources, so I cannot confirm venue hours, availability, ratings, accessibility, transport schedules, prices, or live exchange rates. A scheduled activity time is not proof a venue will be open. Check the venue's official website or relevant operator before relying on these details.";

export function factualAnswer(request: EditRequest): EditResponse {
  const relevant = contextualRequest(request);
  const day = [...relevant.matchAll(/\bday\s+(\d+)\b/gi)].at(-1)?.[1];
  const hours = /opening|closing|\b(?:close|closes|closed|open)\b/i.test(
    relevant,
  );
  return {
    kind: "answer",
    intent: "travel_question",
    evidence: "none",
    message: hours
      ? `${day ? `For Day ${day} of your trip, ` : ""}I cannot confirm the venue's opening or closing hours without live business information. Hours may vary by branch and date; scheduled activities are not proof of opening hours. Check the specific location's official website.`
      : factualLimitation,
  };
}
