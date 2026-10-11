import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { normalizeConversation } from "@/lib/ai/conversation-normalizer";
import {
  normalizeEditResponse,
  proposeItineraryEdit,
} from "@/lib/ai/edit-service";
import { editRequest, removeOperation, withProposal } from "./edit-fixtures";
import {
  conversationOutputSchema,
  type ConversationOutput,
} from "@/lib/ai/edit-output-schema";
import { unsupportedClaim } from "@/lib/ai/claim-policy";
import { shouldShowUncertaintyNotice } from "@/features/trips/uncertainty-policy";
import { conversationDiagnostic } from "@/lib/ai/conversation-diagnostics";
import { advanceContext } from "../evals/conversation-context";
import { summarizeDayCosts } from "@/features/trips/costs";
import { formatMoney } from "@/features/trips/format";
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("@/lib/ai/client", () => ({
  createOpenAIClient: () => ({ responses: { parse } }),
}));
const reply = (
  overrides: Partial<ConversationOutput> = {},
): ConversationOutput => ({
  message: "Here is a planning suggestion.",
  presentation: "response",
  boundary: null,
  proposal: null,
  calculation: null,
  ...overrides,
});
const dayCost = {
  type: "day_cost" as const,
  dayNumber: 2,
  amount: null,
  currency: null,
};
async function respond(raw: unknown) {
  const request = editRequest();
  const before = structuredClone(request);
  const result = await normalizeConversation(raw, request, (value) =>
    normalizeEditResponse(value, request, "ai"),
  );
  expect(request).toEqual(before);
  return result;
}
beforeEach(() => {
  parse.mockReset();
  vi.stubEnv("TRIP_GENERATION_MODE", "ai");
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it.each(["When does GU close?", "When does GU close on a typical Tuesday?"])(
  "returns a cautious hours fallback for %s",
  async (message) => {
    parse.mockResolvedValue({
      status: "completed",
      output: [],
      output_parsed: reply({
        message: "GU closes at 9pm. Choosing a branch first will help.",
      }),
    });
    const request = { ...editRequest(), message };
    const before = structuredClone(request.itinerary);
    const response = await proposeItineraryEdit(request);
    expect(response.kind).toBe("answer");
    expect(response.message).toContain("Choosing a branch first");
    expect(response.message).toContain("can't verify business hours");
    expect(response.message).not.toContain("9pm");
    expect(
      shouldShowUncertaintyNotice({ ...response, content: response.message }),
    ).toBe(false);
    expect(request.itinerary).toEqual(before);
    expect(parse).toHaveBeenCalledTimes(1);
  },
);
it("does not confuse a governed uncertainty clause with a verification assertion", async () => {
  const message =
    "I cannot confirm whether GU is open daily. Check official branch guidance.";
  expect(unsupportedClaim(message)).toBe(false);
  expect((await respond(reply({ message }))).message).toBe(message);
  expect(unsupportedClaim("I cannot verify hours, but GU closes at 9pm.")).toBe(
    true,
  );
});
it.each(["source: imaginary verification", "sk-" + "x".repeat(30)])(
  "never excuses prohibited output inside uncertainty language: %s",
  async (prohibited) => {
    const message = `I cannot verify whether the information is ${prohibited}.`;
    expect(unsupportedClaim(message)).toBe(true);
    const result = await respond(reply({ message }));
    expect(result.message).not.toContain(prohibited);
    expect(result.kind).toBe("answer");
  },
);
it.each([
  "without extra travel time",
  "without any additional transit time",
  "exactly 5 minutes away",
])("replaces unsupported geographic convenience: %s", async (claim) => {
  const result = await respond(
    reply({ message: `A shopping stop fits ${claim}.` }),
  );
  expect(result.message).not.toContain(claim);
  expect(result.message).toContain("can't verify its proximity");
  expect(result.kind).toBe("answer");
});
it("preserves a current calculation when the proposal has invalid IDs", async () => {
  const result = await respond(
    reply({
      calculation: dayCost,
      proposal: {
        operations: [{ ...removeOperation(), activityId: "missing" }],
      },
    }),
  );
  const request = editRequest();
  expect(result.kind).toBe("answer");
  expect(result.message).toContain(
    formatMoney(
      summarizeDayCosts(request.itinerary.days[1]).total,
      request.itinerary.input.currency,
    ),
  );
  expect(result.message).toContain("Current itinerary:");
  expect(result.message).toContain("Proposal unavailable:");
  expect(result.message).not.toContain("Proposed itinerary estimate:");
});
it("preserves useful conversation and a valid proposal when a calculation is malformed", async () => {
  const result = await respond({
    ...reply({
      message: "Leave more free time.",
      proposal: { operations: [removeOperation()] },
    }),
    calculation: { type: "nonsense" },
  });
  expect(result.kind).toBe("proposal");
  expect(result.message).toContain("Leave more free time.");
  expect(result.message).toContain("Calculation unavailable:");
  expect(result.message).toContain("Nothing changes until you accept");
});
it("preserves useful advice when only a calculation is malformed", async () => {
  const result = await respond({
    ...reply({ message: "Leave a little room for breaks." }),
    calculation: { type: "day_cost", dayNumber: "wrong" },
  });
  expect(result.kind).toBe("answer");
  expect(result.message).toContain("Leave a little room for breaks.");
  expect(result.message).not.toContain("Current itinerary:");
});
it("keeps a calculation when the proposal schema is malformed", async () => {
  const result = await respond({
    ...reply({ calculation: dayCost }),
    proposal: { operations: [{ type: "delete_trip_history" }] },
  });
  expect(result.kind).toBe("answer");
  expect(result.message).toContain("Current itinerary:");
  expect(result.message).toContain("Proposal unavailable:");
});
it("does not echo a model spending figure when a calculation fails", async () => {
  const result = await respond({
    ...reply({ message: "Day 2 spending is $999." }),
    calculation: { type: "nonsense" },
  });
  expect(result.kind).toBe("answer");
  expect(result.message).not.toContain("999");
  expect(result.message).not.toContain("Current itinerary:");
});
it("keeps long preference descriptions from erasing a valid proposal", async () => {
  const request = editRequest();
  request.itinerary.input.preferences =
    "Quiet afternoons and plenty of breaks. ".repeat(20);
  const result = await normalizeConversation(
    reply({
      calculation: {
        type: "preferences",
        dayNumber: null,
        amount: null,
        currency: null,
      },
      proposal: { operations: [removeOperation()] },
    }),
    request,
    (value) => normalizeEditResponse(value, request, "ai"),
  );
  expect(result.kind).toBe("proposal");
  expect(result.message.length).toBeLessThanOrEqual(1000);
  expect(result.message).toContain("Nothing changes until you accept");
});
it("ignores irrelevant extra spending for current costs without changing the legacy validator", async () => {
  const raw = {
    ...reply({ proposal: { operations: [removeOperation()] } }),
    calculation: { ...dayCost, amount: 20 },
  };
  expect(conversationOutputSchema.safeParse(raw).success).toBe(false);
  const result = await respond(raw);
  expect(result.kind).toBe("proposal");
  expect(result.message).toContain("Current itinerary:");
  expect(result.message).not.toContain("hypothetical");
  expect(result.message).not.toContain("Only a hypothetical");
});
it("keeps deterministic calculations when a proposed activity contains unsupported hours", async () => {
  const request = editRequest(),
    day = request.itinerary.days[1];
  const activity = day.activities[0];
  const { id: _id, ...draft } = activity;
  void _id;
  const result = await respond(
    reply({
      calculation: dayCost,
      proposal: {
        operations: [
          {
            type: "replace_activity",
            dayId: day.id,
            activityId: activity.id,
            activity: { ...draft, description: "The shop closes at 9pm." },
          },
        ],
      },
    }),
  );
  expect(result.kind).toBe("answer");
  expect(result.message).toContain("Current itinerary:");
  expect(result.message).toContain("can't verify");
  expect(result.message).not.toContain("9pm");
});
it("supports a cheaper dinner replacement and current Day 2 cost in one response", async () => {
  const request = editRequest(),
    day = request.itinerary.days[1],
    dinner = day.activities.at(-1)!;
  const { id: _id, ...draft } = dinner;
  void _id;
  const result = await respond(
    reply({
      calculation: dayCost,
      proposal: {
        operations: [
          {
            type: "replace_activity",
            dayId: day.id,
            activityId: dinner.id,
            activity: {
              ...draft,
              name: "Casual dinner",
              estimatedCost: Math.max(0, dinner.estimatedCost - 5),
            },
          },
        ],
      },
    }),
  );
  expect(result.kind).toBe("proposal");
  expect(result.message).toContain("Current itinerary:");
  expect(result.message).toContain("Proposed itinerary estimate:");
  if (result.kind !== "proposal") throw new Error("Expected proposal");
  expect(result.proposal.candidate.days[0]).toEqual(request.itinerary.days[0]);
  expect(result.proposal.candidate.days[1].activities.slice(0, -1)).toEqual(
    day.activities.slice(0, -1),
  );
});
it("resolves Yes as preparation using the immediately preceding exchange, not acceptance", async () => {
  let request = {
    ...editRequest(),
    message: "Could I do some shopping on Day 2?",
  };
  parse.mockResolvedValueOnce({
    status: "completed",
    output: [],
    output_parsed: reply({
      message: "Would you like a shopping proposal for Day 2?",
    }),
  });
  const answer = await proposeItineraryEdit(request);
  request = {
    ...request,
    message: "Yes",
    context: advanceContext(request, answer),
  };
  parse.mockResolvedValueOnce({
    status: "completed",
    output: [],
    output_parsed: reply({ proposal: { operations: [removeOperation()] } }),
  });
  const result = await proposeItineraryEdit(request);
  expect(result.kind).toBe("proposal");
  expect(
    JSON.parse(parse.mock.calls[1][0].input).recentConversation.at(-1).content,
  ).toContain("Would you like");
  expect(request.baseRevision).toBe(0);
  expect(parse).toHaveBeenCalledTimes(2);
});
it("validates pending context before the model and exposes only declared draft operations", async () => {
  const session = await withProposal(),
    pending = session.pendingProposal!;
  const {
    candidate: _candidate,
    summary: _summary,
    createdAt: _created,
    source: _source,
    ...context
  } = pending;
  void _candidate;
  void _summary;
  void _created;
  void _source;
  parse.mockResolvedValue({
    status: "completed",
    output: [],
    output_parsed: reply(),
  });
  await proposeItineraryEdit({
    ...editRequest(session),
    message: "Make it flexible",
    pendingProposal: context,
  });
  expect(JSON.parse(parse.mock.calls[0][0].input).pendingProposal).toEqual(
    context,
  );
  expect(
    JSON.parse(parse.mock.calls[0][0].input).pendingProposal.candidate,
  ).toBeUndefined();
  parse.mockClear();
  await expect(
    proposeItineraryEdit({
      ...editRequest(session),
      pendingProposal: { ...context, baseRevision: 1 },
    }),
  ).rejects.toMatchObject({ code: "STALE_PROPOSAL" });
  expect(parse).not.toHaveBeenCalled();
  await expect(
    proposeItineraryEdit({
      ...editRequest(session),
      pendingProposal: {
        ...context,
        operations: [{ ...removeOperation(), activityId: "missing" }],
      },
    }),
  ).rejects.toMatchObject({ code: "UNKNOWN_TARGET" });
  expect(parse).not.toHaveBeenCalled();
});
it("emits only stage/code diagnostics in development and nothing in production", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("NODE_ENV", "development");
  conversationDiagnostic("calculation", "INVALID_CALCULATION");
  expect(warn).toHaveBeenCalledWith("[travel-conversation]", {
    stage: "calculation",
    code: "INVALID_CALCULATION",
  });
  vi.stubEnv("NODE_ENV", "production");
  conversationDiagnostic("factual", "UNSUPPORTED_ASSERTION_REPLACED");
  expect(warn).toHaveBeenCalledTimes(1);
});
