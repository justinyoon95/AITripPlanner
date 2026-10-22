import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import {
  providerConversationSchema,
  adaptConversationOutput,
  type ProviderConversation,
} from "@/lib/ai/edit-output-schema";
import { normalizeConversation } from "@/lib/ai/conversation-normalizer";
import {
  normalizeEditResponse,
  proposeItineraryEdit,
} from "@/lib/ai/edit-service";
import {
  createSession,
  acceptProposal,
  invalidateProposal,
  undoVersion,
  restoreVersion,
  validateProposal,
} from "@/features/trips/versioning";
import { generateMockItinerary } from "@/features/trips/mock-generator";
import { editRequest } from "./edit-fixtures";
import { input, previewId } from "./fixtures";
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("@/lib/ai/client", () => ({
  createOpenAIClient: () => ({ responses: { parse } }),
}));
beforeEach(() => {
  parse.mockReset();
  vi.stubEnv("TRIP_GENERATION_MODE", "ai");
  vi.stubEnv("OPENAI_API_KEY", "test-not-real");
});
afterEach(() => vi.unstubAllEnvs());
function reply(action: ProviderConversation["action"]): ProviderConversation {
  return {
    message: "Review this option.",
    presentation: "response",
    boundary: null,
    calculation: null,
    action,
  };
}
function osaka() {
  return createSession(
    generateMockItinerary(
      {
        ...input,
        destination: "Osaka, Japan",
        startDate: "2027-04-15",
        endDate: "2027-04-18",
      },
      previewId,
    ),
  );
}
function replacement(request = editRequest(osaka()), dayIndex = 2) {
  const day = request.itinerary.days[dayIndex],
    { id, ...activity } = day.activities[0];
  return {
    type: "replace_activity" as const,
    dayId: day.id,
    activityId: id,
    activity: {
      ...activity,
      name: "Osaka Castle visit",
      description:
        "A cultural suggestion; verify official visitor information.",
    },
  };
}
it("emits a strict SDK schema with required action decision and bounded proposal operations", () => {
  const format = zodTextFormat(
    providerConversationSchema,
    "travel_conversation_v38",
  );
  expect(format.strict).toBe(true);
  expect(format.schema).toHaveProperty("type", "object");
  expect(format.schema.required).toContain("action");
  expect(
    providerConversationSchema.safeParse({
      ...reply({ type: "none", reason: "informational" }),
      action: { type: "proposal", operations: [] },
    }).success,
  ).toBe(false);
  expect(
    providerConversationSchema.safeParse(
      reply({
        type: "clarification",
        missing: "activity",
        question: "Which activity?",
      }),
    ).success,
  ).toBe(true);
  expect(
    providerConversationSchema.safeParse({
      ...reply({ type: "none", reason: "informational" }),
      action: {
        type: "clarification",
        missing: "permission",
        question: "May I prepare this?",
      },
    }).success,
  ).toBe(false);
});
it.each([false, true])(
  "explicit delegated April 17 replacement prepares one reviewable proposal (other-day duplicate %s)",
  async (redundant) => {
    const session = osaka(),
      request = {
        ...editRequest(session),
        message:
          "Can you replace one of my activities on April 17 with a visit to Osaka Castle? Keep the schedule realistic.",
      };
    if (redundant)
      request.itinerary.days[1].activities[0].name = "Osaka Castle visit";
    parse.mockResolvedValueOnce({
      status: "completed",
      output: [],
      output_parsed: reply({
        type: "proposal",
        operations: [replacement(request)],
      }),
    });
    const response = await proposeItineraryEdit(request);
    expect(response.kind).toBe("proposal");
    expect(parse).toHaveBeenCalledOnce();
    const sent = JSON.parse(parse.mock.calls[0][0].input);
    expect(sent.editCapabilities.targetSelectionMayBeDelegated).toBe(true);
    expect(
      sent.editCapabilities.preparingProposalRequiresNoAdditionalPermission,
    ).toBe(true);
    expect(session.versions).toHaveLength(1);
  },
);
it("keeps an ambiguous agreement as focused clarification and never accepts a draft", async () => {
  const request = {
    ...editRequest(osaka()),
    message: "Yes",
    context: [
      { role: "user" as const, content: "Can you add a late visit?" },
      {
        role: "assistant" as const,
        content: "Keep the current visit, or add an evening activity?",
        outcome: "clarification" as const,
      },
    ],
  };
  parse.mockResolvedValueOnce({
    status: "completed",
    output: [],
    output_parsed: reply({
      type: "clarification",
      missing: "ambiguous_confirmation",
      question: "Keep the existing visit, or prepare an evening option?",
    }),
  });
  const response = await proposeItineraryEdit(request);
  expect(response.kind).toBe("clarification");
  expect(response.message).toContain("or prepare");
  expect(parse).toHaveBeenCalledOnce();
});
it("a single offered action and agreement can prepare a proposal but cannot accept it", async () => {
  const session = osaka(),
    request = {
      ...editRequest(session),
      message: "Yes",
      context: [
        { role: "user" as const, content: "Please replace a museum." },
        {
          role: "assistant" as const,
          content: "Should I prepare Osaka Castle instead?",
          outcome: "clarification" as const,
        },
      ],
    };
  const response = await normalizeConversation(
    reply({ type: "proposal", operations: [replacement(request)] }),
    request,
    (raw) => normalizeEditResponse(raw, request, "ai"),
  );
  expect(response.kind).toBe("proposal");
  expect(session.versions).toHaveLength(1);
});
it("a rejected/no-op proposal cannot retain success narration", async () => {
  const request = editRequest(osaka()),
    day = request.itinerary.days[2],
    { id, ...activity } = day.activities[0];
  const raw = {
    ...reply({
      type: "proposal",
      operations: [
        { type: "replace_activity", dayId: day.id, activityId: id, activity },
      ],
    }),
    message: "Your itinerary has been updated. The visit is now included.",
  };
  const response = await normalizeConversation(raw, request, (wire) =>
    normalizeEditResponse(wire, request, "ai"),
  );
  expect(response.kind).toBe("clarification");
  expect(response.message).toContain("no new change");
  expect(response.message).not.toContain("now included");
  expect(response.message).not.toContain("has been updated");
});
it("blocks same-day duplicates without misrepresenting a successful replacement", async () => {
  const request = editRequest(osaka()),
    op = replacement(request);
  op.activity.name = request.itinerary.days[2].activities[1].name;
  const response = await normalizeConversation(
    reply({ type: "proposal", operations: [op] }),
    request,
    (wire) => normalizeEditResponse(wire, request, "ai"),
  );
  expect(response.kind).toBe("clarification");
  expect(response.message).toContain("unchanged");
});
it("renders valid new-contract proposals from validated operations, not optimistic model narration", async () => {
  const request = editRequest(osaka());
  const raw = {
    ...reply({ type: "proposal", operations: [replacement(request)] }),
    message: "The visit was added and the reservation is confirmed.",
  };
  const response = await normalizeConversation(raw, request, (wire) =>
    normalizeEditResponse(wire, request, "ai"),
  );
  expect(response.kind).toBe("proposal");
  expect(response.message).toContain("Proposed changes:");
  expect(response.message).toContain("Osaka Castle");
  expect(response.message).not.toContain("was added");
  expect(response.message).not.toContain("reservation is confirmed");
});
it("rejects malformed mixed legacy/new contracts instead of silently dropping action fields", async () => {
  const request = editRequest(osaka()),
    raw = {
      ...reply({ type: "proposal", operations: [replacement(request)] }),
      proposal: null,
    };
  expect(adaptConversationOutput(raw)).toBeNull();
  await expect(
    normalizeConversation(raw, request, (wire) =>
      normalizeEditResponse(wire, request, "ai"),
    ),
  ).rejects.toThrow(/incomplete/);
});
it("review acceptance, rejection, stale detection, undo and restore remain authoritative", async () => {
  const original = osaka(),
    request = editRequest(original);
  const response = await normalizeConversation(
    reply({ type: "proposal", operations: [replacement(request)] }),
    request,
    (wire) => normalizeEditResponse(wire, request, "ai"),
  );
  if (response.kind !== "proposal") throw Error("Expected draft");
  const pending = { ...original, pendingProposal: response.proposal };
  expect(invalidateProposal(pending).versions).toEqual(original.versions);
  const accepted = await acceptProposal(pending, response.proposal.id);
  expect(accepted.versions).toHaveLength(2);
  await expect(validateProposal(accepted, response.proposal)).rejects.toThrow();
  const undone = undoVersion(accepted);
  expect(undone.activeVersionId).toBe(original.activeVersionId);
  expect(restoreVersion(undone, accepted.activeVersionId).activeVersionId).toBe(
    accepted.activeVersionId,
  );
});
it("keeps informational responses and preferences free of edit proposals", async () => {
  const request = editRequest(osaka());
  for (const reason of ["informational", "preference"] as const) {
    const response = await normalizeConversation(
      reply({ type: "none", reason }),
      request,
      (wire) => normalizeEditResponse(wire, request, "ai"),
    );
    expect(response.kind).toBe("answer");
    expect(response).not.toHaveProperty("proposal");
  }
});
it.each([false, true])(
  "cross-day operations preserve unrelated days and honor selected scope (restricted %s)",
  async (restricted) => {
    const request = editRequest(osaka());
    if (restricted)
      request.scope = { dayId: request.itinerary.days[0].id, activityId: null };
    const operations = [replacement(request, 0), replacement(request, 1)];
    const response = await normalizeConversation(
      reply({ type: "proposal", operations }),
      request,
      (wire) => normalizeEditResponse(wire, request, "ai"),
    );
    if (restricted) {
      expect(response.kind).toBe("clarification");
      expect(response.message).toContain("unchanged");
    } else {
      expect(response.kind).toBe("proposal");
      if (response.kind !== "proposal") throw Error("Expected draft");
      expect(response.proposal.candidate.days[2]).toEqual(
        request.itinerary.days[2],
      );
    }
  },
);
it("retains a valid calculation when the new action is invalid", async () => {
  const request = editRequest(osaka());
  const response = await normalizeConversation(
    {
      ...reply({ type: "none", reason: "informational" }),
      action: { type: "proposal", operations: [] },
      calculation: {
        type: "day_cost",
        dayNumber: 2,
        amount: null,
        currency: null,
      },
    },
    request,
    (wire) => normalizeEditResponse(wire, request, "ai"),
  );
  expect(response.kind).toBe("answer");
  expect(response.message).toContain("Current itinerary:");
  expect(response.message).toContain("Proposal unavailable:");
});
it("retains a separately valid new proposal when calculation data is malformed", async () => {
  const request = editRequest(osaka());
  const response = await normalizeConversation(
    {
      ...reply({ type: "proposal", operations: [replacement(request)] }),
      calculation: { type: "unknown" },
    },
    request,
    (wire) => normalizeEditResponse(wire, request, "ai"),
  );
  expect(response.kind).toBe("proposal");
  expect(response.message).toContain("Calculation unavailable:");
  expect(response.message).toContain("Nothing changes until you accept");
});
