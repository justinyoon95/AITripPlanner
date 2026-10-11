import { expect, it, vi } from "vitest";
import { fixtureRequest } from "../evals/fixtures";
import { contextualRequest } from "@/lib/ai/conversation-context";
import { hasEditAuthorization, requestBoundary } from "@/lib/ai/chat-policy";
import { normalizeChatResponse } from "@/lib/ai/chat-normalizer";
import { shouldShowUncertaintyNotice } from "@/features/trips/uncertainty-policy";
import { editInstructions, editInput } from "@/lib/ai/edit-prompts";
import {
  editRequestSchema,
  type EditRequest,
} from "@/features/trips/edit-schema";

const reply = {
  kind: "answer",
  intent: "travel_question",
  operations: [],
  question: null,
  message: "I cannot verify current hours.",
};
const request = (message: string): EditRequest => ({
  ...fixtureRequest(message),
  context: [
    { role: "user" as const, content: "When does GU close?" },
    {
      role: "assistant" as const,
      intent: "travel_question" as const,
      content: "[answered] I cannot verify this store's hours.",
    },
  ],
});
it.each(["on day 1", "Day 1.", "in Namba", "Osaka branch"])(
  "carries the most recent informational topic for %s without edit permission",
  async (message) => {
    const req = request(message),
      snapshot = structuredClone(req),
      propose = vi.fn();
    expect(contextualRequest(req)).toContain("When does GU close?");
    expect(hasEditAuthorization(req)).toBe(false);
    expect(await normalizeChatResponse(reply, req, propose)).toMatchObject({
      kind: "answer",
      evidence: "none",
    });
    expect(propose).not.toHaveBeenCalled();
    expect(req).toEqual(snapshot);
  },
);
it("retains both day and location across consecutive informational replies", async () => {
  const req = request("in Namba");
  req.context.push(
    { role: "user", content: "on day 1" },
    {
      role: "assistant",
      intent: "travel_question",
      content: "[answered] I cannot confirm hours for Day 1.",
    },
  );
  const result = await normalizeChatResponse(reply, req, vi.fn());
  expect(result.message).toContain("Day 1");
  expect(contextualRequest(req)).toContain("in Namba");
});
it("recovers a model's invalid edit interpretation of an informational day follow-up", async () => {
  const req = request("on day 1"),
    propose = vi.fn(),
    day = req.itinerary.days[0];
  const raw = {
    ...reply,
    kind: "proposal",
    intent: "itinerary_edit",
    operations: [
      {
        type: "remove_activity",
        dayId: day.id,
        activityId: day.activities[0].id,
      },
    ],
  };
  expect(await normalizeChatResponse(raw, req, propose)).toMatchObject({
    kind: "answer",
    message: expect.stringContaining("Day 1"),
  });
  expect(propose).not.toHaveBeenCalled();
});
it("does not send informational follow-ups into generic edit clarification", async () => {
  expect(
    await normalizeChatResponse(
      {
        ...reply,
        kind: "clarification",
        intent: "clarification_needed",
        message:
          "What would you like changed: fewer activities or a replacement?",
      },
      request("on day 1"),
      vi.fn(),
    ),
  ).toMatchObject({ kind: "answer" });
});
it("does not attach unrelated older questions, completed proposals, or fresh edits", () => {
  const req = request("on day 1");
  req.context.unshift(
    { role: "user", content: "How much does food cost?" },
    {
      role: "assistant",
      intent: "travel_question",
      content: "[answered] The food estimate is $100.",
    },
  );
  expect(contextualRequest(req)).not.toContain("food cost");
  expect(contextualRequest({ ...req, message: "Make Day 1 less busy" })).toBe(
    "Make Day 1 less busy",
  );
  expect(
    contextualRequest({ ...req, message: "When does another venue close?" }),
  ).toBe("When does another venue close?");
  req.context.at(-1)!.intent = "itinerary_edit";
  req.context.at(-1)!.content = "[accepted] Review these changes.";
  expect(contextualRequest(req)).toBe("on day 1");
});
it.each([
  "When does donqi hote close?",
  "When does donki close?",
  "When does don quijote close?",
])(
  "permits focused business clarification without inventing an entity: %s",
  async (message) => {
    const req = fixtureRequest(message);
    expect(requestBoundary(req)).toBeNull();
    const result = await normalizeChatResponse(
      {
        ...reply,
        kind: "clarification",
        intent: "clarification_needed",
        message:
          "Do you mean Don Quijote, the retailer, or a different business? Which location?",
      },
      req,
      vi.fn(),
    );
    expect(result.kind).toBe("clarification");
    expect(result.message).toContain("Which location?");
  },
);
it("provides destination and typo context in the existing single-call input", () => {
  const req = fixtureRequest("When does donki hote close?");
  const input = JSON.parse(editInput(req));
  expect(input.itinerary.input.destination).toBe("Kyoto, Japan");
  expect(input.request).toContain("donki hote");
  expect(editInstructions).toMatch(/phonetic spellings/);
  expect(editInstructions).toMatch(/informational|Informational/);
  expect(editRequestSchema.safeParse(request("on day 1")).success).toBe(true);
});
it.each([
  "I cannot verify closing hours. Check the official website.",
  "I don't have specific information on GU's closing hours.",
  "These hours are unverified; please check official guidance.",
])(
  "suppresses duplicate notices without deleting the disclosure: %s",
  (content) => {
    expect(
      shouldShowUncertaintyNotice({
        evidence: "unverified_suggestion",
        intent: "travel_question",
        content,
      }),
    ).toBe(false);
  },
);
it("retains notices on new recommendations but not deterministic changes", () => {
  expect(
    shouldShowUncertaintyNotice({
      evidence: "unverified_suggestion",
      intent: "itinerary_edit",
      content: "I cannot verify this newly suggested shop.",
    }),
  ).toBe(true);
  expect(
    shouldShowUncertaintyNotice({
      evidence: "unverified_suggestion",
      intent: "travel_question",
      content: "I cannot verify hours. Consider New Cafe for lunch.",
    }),
  ).toBe(true);
  for (const evidence of ["itinerary_data", "itinerary_estimates", "none"])
    expect(
      shouldShowUncertaintyNotice({
        evidence,
        content: "Removed one activity.",
      }),
    ).toBe(false);
});
