import { expect, it, vi } from "vitest";
import { fixtureRequest } from "../evals/fixtures";
import { normalizeChatResponse } from "@/lib/ai/chat-normalizer";
import { requestBoundary } from "@/lib/ai/chat-policy";
import { contextualRequest } from "@/lib/ai/conversation-context";
import { normalizeEditResponse } from "@/lib/ai/edit-service";
import { assertSupportedClaims } from "@/lib/ai/claim-policy";
import type { EditRequest } from "@/features/trips/edit-schema";

const wire = (req: EditRequest) => ({
  kind: "proposal",
  intent: "itinerary_edit",
  question: null,
  message: "Remove one activity to leave more free time.",
  operations: [
    {
      type: "remove_activity",
      dayId: req.itinerary.days[0].id,
      activityId: req.itinerary.days[0].activities[0].id,
    },
  ],
});
const answer = {
  kind: "answer",
  intent: "travel_question",
  question: null,
  operations: [],
  message: "General advice.",
};
function followup(latest: string, turns: string[]): EditRequest {
  return {
    ...fixtureRequest(latest),
    context: turns.map((content, i) => ({
      role: i % 2 ? "assistant" : "user",
      content,
    })),
  };
}
it.each([
  "Can you change my budget to 500 dollars?",
  "Change my overall budget to $500",
  "Can I change my destination to Tokyo?",
])(
  "declines unsupported trip settings without calculation or mutation: %s",
  async (message) => {
    const req = fixtureRequest(message),
      snapshot = structuredClone(req),
      propose = vi.fn();
    const result = await normalizeChatResponse(
      {
        ...answer,
        question: {
          type: "budget_delta",
          dayNumber: null,
          amount: 500,
          currency: "USD",
        },
      },
      req,
      propose,
    );
    expect(result).toMatchObject({ kind: "answer", evidence: "none" });
    expect(result.message).toMatch(/not supported.*Plan your trip/);
    expect(result.message).not.toMatch(/additional amount|confirm the day/);
    expect(propose).not.toHaveBeenCalled();
    expect(req).toEqual(snapshot);
  },
);
it.each(["$500 overall", "Just an overall budget please."])(
  "retains budget-setting meaning in clarification: %s",
  (latest) => {
    const req = followup(latest, ["Can you change my budget?", "What amount?"]);
    expect(requestBoundary(req)?.message).toContain("budget is not supported");
  },
);
it.each([
  "Make Day 1 more relaxing",
  "I want day 1 to be relaxing",
  "I just want less events in day 1",
  "I want fewer events on Day 1",
])("does not reject a valid model interpretation: %s", async (message) => {
  const req = fixtureRequest(message);
  const result = await normalizeChatResponse(wire(req), req, (raw) =>
    normalizeEditResponse(raw, req, "ai"),
  );
  expect(result).toMatchObject({
    kind: "proposal",
    evidence: "itinerary_data",
  });
  if (result.kind === "proposal")
    expect(result.proposal.candidate.days[1]).toEqual(req.itinerary.days[1]);
});
it("resolves Day 1 then fewer activities without a new state machine", async () => {
  const req = followup("Fewer activities", [
    "Make my itinerary better.",
    "[clarification] What would you like to improve?",
    "[answered] Day 1",
    "[clarification] What would you like to change about Day 1?",
  ]);
  expect(contextualRequest(req)).toContain("Day 1");
  expect(
    await normalizeChatResponse(wire(req), req, (raw) =>
      normalizeEditResponse(raw, req, "ai"),
    ),
  ).toMatchObject({ kind: "proposal" });
});
it("resolves a short replacement reply against the current target", async () => {
  const req = followup("Shopping", [
    "Replace Museum 1 on Day 1",
    "[clarification] What would you prefer instead?",
  ]);
  const old = req.itinerary.days[0].activities[0];
  const output = {
    ...wire(req),
    operations: [
      {
        type: "replace_activity",
        dayId: req.itinerary.days[0].id,
        activityId: old.id,
        activity: {
          name: "Shopping suggestion",
          description: "Browse local shops; details unverified.",
          category: "Shopping",
          time: old.time,
          durationMinutes: old.durationMinutes,
          estimatedCost: 20,
        },
      },
    ],
  };
  expect(
    await normalizeChatResponse(output, req, (raw) =>
      normalizeEditResponse(raw, req, "ai"),
    ),
  ).toMatchObject({ kind: "proposal", evidence: "unverified_suggestion" });
});
it.each([
  "[accepted] Review these changes.",
  "[rejected] Review these changes.",
  "[answered] Your estimate is $400.",
])("does not revive completed context: %s", (assistant) => {
  const req = followup("Shopping", ["Replace Museum 1", assistant]);
  expect(contextualRequest(req)).toBe("Shopping");
});
it("does not inherit edit permission for a fresh informational question", async () => {
  const req = followup("What happens if I remove the museum?", [
    "Replace Museum 1",
    "[clarification] What would you prefer instead?",
  ]);
  const propose = vi.fn();
  expect(await normalizeChatResponse(wire(req), req, propose)).toMatchObject({
    kind: "clarification",
  });
  expect(propose).not.toHaveBeenCalled();
});
it("does not turn an older hypothetical edit question into permission", async () => {
  const req = followup("Shopping", [
    "What happens if I replace Museum 1?",
    "[clarification] What would you prefer instead?",
  ]);
  const propose = vi.fn();
  expect(await normalizeChatResponse(wire(req), req, propose)).toMatchObject({
    kind: "clarification",
  });
  expect(propose).not.toHaveBeenCalled();
});
it.each([
  "Is Eaton Centre open on Day 4?",
  "Is Eaton Centre open on Day 3?",
  "Are tickets available on Day 2?",
  "What is the bus departure schedule?",
])("never uses scheduled time as factual evidence: %s", async (message) => {
  const req = fixtureRequest(message),
    propose = vi.fn(),
    snapshot = structuredClone(req);
  const result = await normalizeChatResponse(
    { ...answer, message: "It is expected to be open at 14:00." },
    req,
    propose,
  );
  expect(result.message).toMatch(/cannot verify|cannot confirm/);
  expect(result.message).not.toContain("14:00");
  if (message.includes("Day 4"))
    expect(result.message).toContain("Day 4 is not in");
  expect(propose).not.toHaveBeenCalled();
  expect(req).toEqual(snapshot);
});
it("separates useful etiquette from unverified institutional policies", async () => {
  const result = await normalizeChatResponse(
    { ...answer, message: "Photography is allowed. Food is prohibited." },
    fixtureRequest("What etiquette should I know at Royal Ontario Museum?"),
    vi.fn(),
  );
  expect(result).toMatchObject({ kind: "answer", evidence: "none" });
  expect(result.message).toContain("General etiquette");
  expect(result.message).toContain("have not checked");
  expect(result.message).not.toMatch(
    /Photography is allowed|Food is prohibited/,
  );
});
it.each([
  "Photography is allowed.",
  "Food is prohibited.",
  "It is expected to be open at 14:00.",
  "Tickets are available.",
])(
  "blocks unqualified factual policy assertions outside etiquette routing: %s",
  (text) => {
    expect(() => assertSupportedClaims(text)).toThrow();
  },
);
it("still answers hypothetical spending, not budget setting", async () => {
  const req = fixtureRequest(
    "If I spend another $100 on Day 2, will I exceed my budget?",
  );
  const result = await normalizeChatResponse(
    {
      ...answer,
      question: {
        type: "budget_delta",
        dayNumber: 2,
        amount: 100,
        currency: "USD",
      },
    },
    req,
    vi.fn(),
  );
  expect(result.kind).toBe("answer");
  expect(result.message).toContain("$500.00");
});
it("resolved clarification cannot bypass the minimum activity constraint", async () => {
  const req = followup("Fewer activities", [
    "Make Day 1 more relaxing",
    "[clarification] What would you like to change?",
  ]);
  req.itinerary.days[0].activities = [req.itinerary.days[0].activities[0]];
  await expect(
    normalizeChatResponse(wire(req), req, (raw) =>
      normalizeEditResponse(raw, req, "ai"),
    ),
  ).rejects.toMatchObject({ code: "EMPTY_DAY" });
});
it("a corrected day replaces the invalid day in the clarification context", async () => {
  const req = followup("Day 3", [
    "Is Eaton Centre open on Day 4?",
    "[clarification] Which existing day did you mean?",
  ]);
  const result = await normalizeChatResponse(answer, req, vi.fn());
  expect(result.kind).toBe("answer");
  expect(result.message).toContain("cannot confirm");
  expect(result.message).not.toContain("Day 4 is not in");
});
it("does not confuse open-air preferences with opening-hour verification", async () => {
  expect(
    await normalizeChatResponse(
      answer,
      fixtureRequest("What open-air activities are good for relaxing?"),
      vi.fn(),
    ),
  ).toMatchObject({ kind: "answer", message: "General advice." });
});
it("does not mistake activity edits mentioning budget for trip-setting changes", () => {
  expect(
    requestBoundary(
      fixtureRequest(
        "Change Museum 1 to a cheaper alternative within my budget",
      ),
    ),
  ).toBeNull();
});
it("budget confirmation after the unsupported-setting explanation cannot fall into calculations", () => {
  const req = followup("Just an overall budget please", [
    "Can you change my budget to 500 dollars?",
    "[answered] Changing the trip's budget is not supported in this preview.",
  ]);
  expect(requestBoundary(req)?.message).toContain("budget is not supported");
});
