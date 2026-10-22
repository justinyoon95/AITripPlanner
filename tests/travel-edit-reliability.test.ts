import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { normalizeConversation } from "@/lib/ai/conversation-normalizer";
import {
  normalizeEditResponse,
  proposeItineraryEdit,
} from "@/lib/ai/edit-service";
import { conversationInstructions } from "@/lib/ai/conversation-prompts";
import { editInput } from "@/lib/ai/edit-prompts";
import { safeActionMessage } from "@/lib/ai/conversation-facts";
import { generateMockItinerary } from "@/features/trips/mock-generator";
import { applyEditOperations } from "@/features/trips/edit-engine";
import { createSession, acceptProposal } from "@/features/trips/versioning";
import { resolveCity, resolveAirport } from "@/lib/geography";
import { advanceContext } from "../evals/conversation-context";
import { editRequest } from "./edit-fixtures";
import { input, previewId } from "./fixtures";
import type { EditRequest } from "@/features/trips/edit-schema";
import type { ConversationOutput } from "@/lib/ai/edit-output-schema";

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("@/lib/ai/client", () => ({
  createOpenAIClient: () => ({ responses: { parse } }),
}));
beforeEach(() => {
  parse.mockReset();
  vi.stubEnv("TRIP_GENERATION_MODE", "ai");
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
});
afterEach(() => vi.unstubAllEnvs());
const reply = (
  overrides: Partial<ConversationOutput> = {},
): ConversationOutput => ({
  message: "Review this option.",
  presentation: "response",
  boundary: null,
  proposal: null,
  calculation: null,
  ...overrides,
});
async function respond(raw: unknown, request = editRequest()) {
  const before = structuredClone(request);
  const response = await normalizeConversation(raw, request, (wire) =>
    normalizeEditResponse(wire, request, "ai"),
  );
  expect(request).toEqual(before);
  return response;
}
function replacement(request = editRequest()) {
  const day = request.itinerary.days[1],
    target = day.activities[0];
  const { id: _id, ...draft } = target;
  void _id;
  return {
    type: "replace_activity" as const,
    dayId: day.id,
    activityId: target.id,
    activity: {
      ...draft,
      name: "Castle visit",
      description: "A cultural suggestion; confirm visitor information.",
    },
  };
}
function flightRequest(arrival = "17:40"): EditRequest {
  const itinerary = generateMockItinerary(
    {
      ...input,
      destination: "Osaka, Japan",
      resolvedDestination: resolveCity("Osaka, Japan"),
      travelers: 2,
      travel: {
        arrival: {
          date: input.startDate,
          time: arrival,
          airportCode: "KIX",
          airport: resolveAirport("KIX"),
        },
        accommodation:
          arrival === "23:30"
            ? undefined
            : {
                checkInDate: input.startDate,
                checkInAvailableFrom: "15:00",
                plannedHotelArrivalDate: input.startDate,
                plannedHotelArrivalTime: "21:00",
              },
      },
    },
    previewId,
  );
  return editRequest(createSession(itinerary));
}
it.each([
  "I have added a visit.",
  "I will enhance your evening by adding dinner.",
  "Your schedule has been updated.",
  "I've replaced dinner.",
])(
  "does not present a committed action without a proposal: %s",
  async (message) => {
    const response = await respond(reply({ message }));
    expect(response.kind).toBe("answer");
    expect(response.message).not.toContain(message);
    expect(response.message).toContain("unchanged");
  },
);
it("does not change ordinary recommendations or focused questions", () => {
  expect(
    safeActionMessage(
      "I can suggest an evening walk. Would you like a proposal?",
      false,
    ),
  ).toBe("I can suggest an evening walk. Would you like a proposal?");
});
it("discards confident narration of a no-op while keeping a calculation", async () => {
  const request = editRequest(),
    day = request.itinerary.days[1],
    target = day.activities[0];
  const { id: _id, ...activity } = target;
  void _id;
  const result = await respond(
    reply({
      message:
        "I will enhance your evening by adding dinner. The only activity will be dinner.",
      calculation: {
        type: "day_cost",
        dayNumber: 2,
        amount: null,
        currency: null,
      },
      proposal: {
        operations: [
          {
            type: "replace_activity",
            dayId: day.id,
            activityId: target.id,
            activity,
          },
        ],
      },
    }),
    request,
  );
  expect(result.kind).toBe("answer");
  expect(result.message).toContain("no new change to review");
  expect(result.message).toContain("Current itinerary:");
  expect(result.message).not.toContain("only activity");
  expect(result.message).not.toContain("enhance");
});
it("presents a valid replacement as a draft even when model claims completion", async () => {
  const request = editRequest();
  const response = await respond(
    reply({
      message: "Your itinerary has been updated.",
      proposal: { operations: [replacement(request)] },
    }),
    request,
  );
  expect(response.kind).toBe("proposal");
  expect(response.message).toContain("proposed change for your review");
  expect(response.message).toContain("Nothing changes until you accept");
  expect(response.message).not.toContain("has been updated");
});
it("allows a requested replacement when the same attraction is on another day", async () => {
  const request = editRequest();
  request.itinerary.days[0].activities[0].name = "Castle visit";
  const result = await respond(
    reply({ proposal: { operations: [replacement(request)] } }),
    request,
  );
  expect(result.kind).toBe("proposal");
  if (result.kind !== "proposal") throw new Error("Expected draft");
  expect(result.proposal.candidate.days[0]).toEqual(request.itinerary.days[0]);
});
it.each(["20:00", "21:00"])(
  "rejects a flight/hotel conflict at %s without echoing misleading advice",
  async (time) => {
    const request = flightRequest(),
      day = request.itinerary.days[0];
    const result = await respond(
      reply({
        message: "I have added the visit. This fits well after check-in.",
        proposal: {
          operations: [
            {
              type: "add_activity",
              dayId: day.id,
              activity: {
                ...replacement(request).activity,
                time,
                durationMinutes: 30,
              },
            },
          ],
        },
      }),
      request,
    );
    expect(result.kind).toBe("clarification");
    expect(result.message).toContain("accommodation window");
    expect(result.message).toContain("unchanged");
    expect(result.message).not.toContain("fits well");
  },
);
it("preserves exact arrival, hotel and whole-party context", () => {
  const request = flightRequest(),
    context = JSON.parse(editInput(request));
  expect(context.itinerary.input.travel.arrival.time).toBe("17:40");
  expect(
    context.itinerary.input.travel.accommodation.plannedHotelArrivalTime,
  ).toBe("21:00");
  expect(context.itinerary.input.travelers).toBe(2);
  expect(context.planningWindows[0].start).toBe(20 * 60 + 40);
  expect(context.planningWindows[0].appointments).toEqual([
    { start: 1260, end: 1290 },
  ]);
});
it("rejects adding sightseeing to a genuinely logistics-only day", async () => {
  const request = flightRequest("23:30"),
    day = request.itinerary.days[0];
  expect(day.activities).toEqual([]);
  const result = await respond(
    reply({
      proposal: {
        operations: [
          {
            type: "add_activity",
            dayId: day.id,
            activity: {
              ...replacement(request).activity,
              time: "23:30",
              durationMinutes: 15,
            },
          },
        ],
      },
    }),
    request,
  );
  expect(result.kind).toBe("clarification");
  expect(result.message).toContain("travel-only");
});
it("can add a distinct activity in a safe arrival-day window", async () => {
  const request = flightRequest("16:00"),
    day = request.itinerary.days[0];
  const result = await respond(
    reply({
      proposal: {
        operations: [
          {
            type: "add_activity",
            dayId: day.id,
            activity: {
              ...replacement(request).activity,
              time: "20:30",
              durationMinutes: 30,
            },
          },
        ],
      },
    }),
    request,
  );
  expect(result.kind).toBe("proposal");
});
it("does not empty a flight day with remaining sightseeing time or an ordinary day", () => {
  const request = flightRequest();
  for (const day of request.itinerary.days.slice(0, 2)) {
    expect(() =>
      applyEditOperations(
        request.itinerary,
        day.activities.map((a) => ({
          type: "remove_activity",
          dayId: day.id,
          activityId: a.id,
        })),
      ),
    ).toThrow(/at least one/);
  }
});
it("preserves an empty travel-only day while editing an ordinary day", async () => {
  const request = flightRequest("23:30");
  const result = await respond(
    reply({ proposal: { operations: [replacement(request)] } }),
    request,
  );
  expect(result.kind).toBe("proposal");
  if (result.kind !== "proposal") throw new Error("Expected draft");
  expect(result.proposal.candidate.days[0]).toEqual(request.itinerary.days[0]);
});
it("passes multiple alternatives then ambiguous agreement as separate chronological turns", async () => {
  let request = editRequest();
  const responses = [
    reply({
      presentation: "clarification",
      message: "Keep the existing visit, or suggest an evening activity?",
    }),
    reply({
      presentation: "clarification",
      message:
        "Would you like to keep the plan, or suggest an evening activity?",
    }),
  ];
  for (const [index, message] of [
    "Can you add a late visit?",
    "Yes",
  ].entries()) {
    parse.mockResolvedValueOnce({
      status: "completed",
      output: [],
      output_parsed: responses[index],
    });
    request = { ...request, message };
    const response = await proposeItineraryEdit(request);
    expect(response.kind).toBe("clarification");
    request = { ...request, context: advanceContext(request, response) };
  }
  expect(
    JSON.parse(parse.mock.calls[1][0].input).recentConversation.at(-1).content,
  ).toContain("or suggest");
  expect(conversationInstructions).toContain(
    "a bare agreement does not choose",
  );
  expect(parse).toHaveBeenCalledTimes(2);
});
it("keeps conversational agreement distinct from review acceptance", async () => {
  const request = editRequest(),
    session = createSession(request.itinerary);
  const result = await respond(
    reply({ proposal: { operations: [replacement(request)] } }),
    request,
  );
  expect(session.versions).toHaveLength(1);
  if (result.kind !== "proposal") throw new Error("Expected draft");
  // Only the explicit acceptance function creates an immutable version.
  const accepted = await acceptProposal(
    { ...session, pendingProposal: result.proposal },
    result.proposal.id,
  );
  expect(accepted.versions).toHaveLength(2);
});
it.each([false, true])(
  "passes an explicit April 17 replacement request through one model call (redundant: %s)",
  async (redundant) => {
    const itinerary = generateMockItinerary(
      { ...input, startDate: "2027-04-15", endDate: "2027-04-17" },
      previewId,
    );
    if (redundant) itinerary.days[1].activities[0].name = "Osaka Castle visit";
    const request = {
      ...editRequest(createSession(itinerary)),
      message:
        "Can you replace one of my activities on April 17 with a visit to Osaka Castle? Keep the schedule realistic.",
    };
    const day = itinerary.days[2],
      target = day.activities[0];
    const { id: _id, ...activity } = target;
    void _id;
    parse.mockResolvedValueOnce({
      status: "completed",
      output: [],
      output_parsed: reply({
        message:
          "Another castle visit is an option; review the proposed replacement.",
        proposal: {
          operations: [
            {
              type: "replace_activity",
              dayId: day.id,
              activityId: target.id,
              activity: { ...activity, name: "Osaka Castle visit" },
            },
          ],
        },
      }),
    });
    const response = await proposeItineraryEdit(request);
    expect(response.kind).toBe("proposal");
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse.mock.calls[0][0].instructions).toContain(
      "not used as a reason to withhold",
    );
    expect(JSON.parse(parse.mock.calls[0][0].input).request).toBe(
      request.message,
    );
    expect(request.itinerary).toEqual(itinerary);
  },
);
it("does not infer castle opening hours from a scheduling conflict", async () => {
  const response = await respond(
    reply({
      message:
        "The visit is likely too late for the castle's hours. Check the venue's official guidance.",
    }),
  );
  expect(response.message).not.toContain("too late for");
  expect(response.message).toContain("can't verify");
});
