import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { editRequest } from "./edit-fixtures";
import { proposeItineraryEdit } from "@/lib/ai/edit-service";
import { requestEdit } from "@/features/trips/edit-client";
import { POST } from "@/app/api/trips/edits/propose/route";
import { answerTravelQuestion } from "@/features/trips/travel-questions";
import { formatMoney } from "@/features/trips/format";
import { summarizeDayCosts, summarizeCosts } from "@/features/trips/costs";
import {
  createSession,
  acceptProposal,
  undoVersion,
  restoreVersion,
} from "@/features/trips/versioning";
import {
  conversationOutputSchema,
  observationForLegacyMetrics,
  type ConversationOutput,
} from "@/lib/ai/edit-output-schema";

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("@/lib/ai/client", () => ({
  createOpenAIClient: () => ({ responses: { parse } }),
}));
beforeEach(() => {
  parse.mockReset();
  vi.stubEnv("TRIP_GENERATION_MODE", "ai");
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function fixture(
  dayNumber: number,
  presentation: ConversationOutput["presentation"] = "clarification",
) {
  const request = editRequest();
  request.message = `How much am I spending on Day ${dayNumber}, and can you replace dinner with something cheaper?`;
  const day = request.itinerary.days[dayNumber - 1];
  const dinner = day.activities.at(-1)!;
  Object.assign(dinner, {
    name: "Dinner at a local restaurant",
    category: "Food",
    durationMinutes: 90,
    estimatedCost: 40,
  });
  const { id: _id, ...draft } = dinner;
  void _id;
  const operation = {
    type: "replace_activity" as const,
    dayId: day.id,
    activityId: dinner.id,
    activity: {
      ...draft,
      name: "Casual neighborhood dinner",
      estimatedCost: 20,
    },
  };
  const wire: ConversationOutput = {
    message:
      "Here is a less expensive dinner suggestion; venue details are unverified.",
    presentation,
    boundary: null,
    calculation: { type: "day_cost", dayNumber, amount: null, currency: null },
    proposal: { operations: [operation] },
  };
  return { request, day, dinner, operation, wire };
}
function provider(raw: unknown) {
  parse.mockResolvedValue({
    status: "completed",
    output: [],
    output_parsed: raw,
  });
}

it.each([1, 2])(
  "carries the exact Day %i mixed request through provider, route and browser adapter",
  async (dayNumber) => {
    const { request, day, wire } = fixture(dayNumber);
    expect(conversationOutputSchema.safeParse(wire).success).toBe(true);
    const before = structuredClone(request);
    provider(wire);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init: RequestInit) =>
        POST(
          new Request("http://localhost:3000/api/trips/edits/propose", init),
        ),
      ),
    );
    const response = await requestEdit(request);
    expect(response.kind).toBe("proposal");
    if (response.kind !== "proposal")
      throw new Error("Expected reviewable proposal");
    expect(response.message).toContain(
      answerTravelQuestion(request.itinerary, wire.calculation!).message,
    );
    const candidateDay = response.proposal.candidate.days[dayNumber - 1];
    expect(response.message).toContain(
      `Proposed Day ${dayNumber} estimate: ${formatMoney(summarizeDayCosts(candidateDay).total, request.itinerary.input.currency)}`,
    );
    expect(response.message).toContain(
      `Proposed itinerary estimate: ${formatMoney(summarizeCosts(response.proposal.candidate).total, request.itinerary.input.currency)}`,
    );
    expect(summarizeDayCosts(candidateDay).total).toBe(
      summarizeDayCosts(day).total - 20,
    );
    expect(candidateDay.activities.at(-1)?.id).toBe(day.activities.at(-1)?.id);
    expect(candidateDay.activities.slice(0, -1)).toEqual(
      day.activities.slice(0, -1),
    );
    for (const other of request.itinerary.days.filter(
      (item) => item.id !== day.id,
    ))
      expect(
        response.proposal.candidate.days.find((item) => item.id === other.id),
      ).toEqual(other);
    expect(request).toEqual(before);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse.mock.calls[0][0].max_output_tokens).toBe(4000);
    expect(JSON.parse(parse.mock.calls[0][0].input).request).toBe(
      request.message,
    );
    const session = createSession(request.itinerary);
    expect(session.versions).toHaveLength(1);
    const accepted = await acceptProposal(
      { ...session, pendingProposal: response.proposal },
      response.proposal.id,
    );
    expect(accepted.versions).toHaveLength(2);
    expect(undoVersion(accepted).activeVersionId).toBe(session.activeVersionId);
    expect(
      restoreVersion(undoVersion(accepted), accepted.activeVersionId)
        .activeVersionId,
    ).toBe(accepted.activeVersionId);
    await expect(
      acceptProposal(
        { ...session, revision: 1, pendingProposal: response.proposal },
        response.proposal.id,
      ),
    ).rejects.toMatchObject({ code: "STALE_PROPOSAL" });
  },
);
it.each([1, 2])(
  "keeps a Day %i spending answer when dinner needs clarification",
  async (dayNumber) => {
    const { request, wire } = fixture(dayNumber);
    provider({
      ...wire,
      proposal: null,
      message: "Which dinner activity would you like replaced?",
    });
    const response = await proposeItineraryEdit(request);
    expect(response.kind).toBe("answer");
    expect(response.message).toContain("Which dinner activity");
    expect(response.message).toContain(
      answerTravelQuestion(request.itinerary, wire.calculation!).message,
    );
    expect(
      observationForLegacyMetrics({ ...wire, proposal: null }),
    ).toMatchObject({ kind: "answer", intent: "travel_question" });
  },
);
it.each([1, 2])(
  "rejects conflicting Day %i operations as a whole while preserving spending",
  async (dayNumber) => {
    const { request, wire, day, dinner } = fixture(dayNumber);
    provider({
      ...wire,
      proposal: {
        operations: [
          ...wire.proposal!.operations,
          { type: "remove_activity", dayId: day.id, activityId: dinner.id },
        ],
      },
    });
    const response = await proposeItineraryEdit(request);
    expect(response.kind).toBe("answer");
    expect(response.message).toContain(
      answerTravelQuestion(request.itinerary, wire.calculation!).message,
    );
    expect(response.message).toContain("Proposal unavailable:");
    expect(response.message).not.toContain("Proposed itinerary estimate:");
  },
);
it.each([1, 2])(
  "preserves a Day %i proposal with an invalid calculation target",
  async (dayNumber) => {
    const { request, wire } = fixture(dayNumber);
    provider({ ...wire, calculation: { ...wire.calculation, dayNumber: 14 } });
    const response = await proposeItineraryEdit(request);
    expect(response.kind).toBe("proposal");
    expect(response.message).toContain(
      "Calculation unavailable: That day is not in your current trip",
    );
    expect(response.message).not.toContain("Current itinerary:");
    expect(response.message).not.toContain("Proposed Day");
    expect(response.message).toContain("Nothing changes until you accept");
  },
);
it.each([1, 2])(
  "isolates malformed Day %i calculation/proposal components",
  async (dayNumber) => {
    const { request, wire } = fixture(dayNumber);
    provider({ ...wire, calculation: { type: "unknown" } });
    expect(await proposeItineraryEdit(request)).toMatchObject({
      kind: "proposal",
      message: expect.stringContaining("Calculation unavailable:"),
    });
    provider({
      ...wire,
      proposal: { operations: [{ type: "delete_history" }] },
    });
    const response = await proposeItineraryEdit(request);
    expect(response.kind).toBe("answer");
    expect(response.message).toContain("Current itinerary:");
    expect(response.message).toContain("The proposed changes were incomplete");
  },
);
it.each([1, 2])(
  "never produces a proposal when both Day %i components are invalid",
  async (dayNumber) => {
    const { request, wire, day, dinner } = fixture(dayNumber);
    const before = structuredClone(request);
    provider({
      ...wire,
      calculation: { ...wire.calculation, dayNumber: 14 },
      proposal: {
        operations: [
          ...wire.proposal!.operations,
          { type: "remove_activity", dayId: day.id, activityId: dinner.id },
        ],
      },
    });
    const response = await proposeItineraryEdit(request);
    expect(response.kind).toBe("clarification");
    expect(response.message).toContain("Calculation unavailable:");
    expect(response.message).toContain("Proposal unavailable:");
    expect(response.message).not.toContain("Proposed itinerary estimate:");
    expect(request).toEqual(before);
  },
);
it.each([
  { presentation: "boundary", boundary: "out_of_scope" },
  { presentation: "boundary", boundary: null },
  { presentation: "response", boundary: "unsafe_or_disallowed" },
] as const)(
  "fails closed on genuinely conflicting boundary fields: %j",
  async (override) => {
    const { request, wire } = fixture(1);
    provider({ ...wire, ...override });
    await expect(proposeItineraryEdit(request)).rejects.toMatchObject({
      code: "INTENT_ACTION_MISMATCH",
    });
  },
);
