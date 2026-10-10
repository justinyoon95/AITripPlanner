import OpenAI from "openai";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  normalizeEditResponse,
  proposeItineraryEdit,
  MAX_EDIT_OUTPUT_TOKENS,
} from "@/lib/ai/edit-service";
import { editRequest, removeOperation } from "./edit-fixtures";
const { parse, create } = vi.hoisted(() => ({
  parse: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/ai/client", () => ({ createOpenAIClient: create }));
const wire = () => ({
  kind: "proposal",
  message: "One fewer activity on Day 2.",
  operations: [removeOperation()],
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
  vi.stubEnv("TRIP_GENERATION_MODE", "ai");
  vi.stubEnv("OPENAI_MODEL", "gpt-4.1-mini");
  create.mockReturnValue({ responses: { parse } });
  parse.mockResolvedValue({
    status: "completed",
    output: [],
    output_parsed: wire(),
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("uses strict structured operations, bounded output and only current itinerary/context", async () => {
  const request = editRequest();
  request.context = [{ role: "user", content: "Prefer fewer stops" }];
  const result = await proposeItineraryEdit(request);
  expect(result.kind).toBe("proposal");
  expect(parse).toHaveBeenCalledWith(
    expect.objectContaining({
      max_output_tokens: MAX_EDIT_OUTPUT_TOKENS,
      store: false,
      model: "gpt-4.1-mini",
      text: {
        format: expect.objectContaining({ strict: true, type: "json_schema" }),
      },
    }),
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  const sent = JSON.parse(parse.mock.calls[0][0].input);
  expect(sent.recentConversation).toEqual(request.context);
  expect(sent.itinerary.days).toEqual(request.itinerary.days);
  expect(sent).not.toHaveProperty("versions");
  expect(sent.itinerary).not.toHaveProperty("overview");
});
it("assigns new activity UUIDs on the server and preserves original IDs", async () => {
  const request = editRequest();
  const activity = request.itinerary.days[0].activities[0];
  const draft = {
    name: "Night walk",
    description: "Outdoor stroll",
    category: activity.category,
    time: "22:00",
    durationMinutes: 30,
    estimatedCost: 0,
  };
  const result = await normalizeEditResponse(
    {
      kind: "proposal",
      message: "Add a walk",
      operations: [
        {
          type: "add_activity",
          dayId: request.itinerary.days[0].id,
          activity: draft,
        },
      ],
    },
    request,
    "ai",
  );
  if (result.kind !== "proposal") throw new Error("Expected proposal");
  expect(result.proposal.candidate.days[0].activities.at(-1)!.id).toMatch(
    /^[a-f0-9-]{36}$/,
  );
  expect(result.proposal.candidate.days.slice(1)).toEqual(
    request.itinerary.days.slice(1),
  );
  expect(result.proposal.baseFingerprint).toMatch(/^[a-f0-9]{64}$/);
});
it("supports clarification but rejects empty/conflicting/malformed/overly complex responses", async () => {
  const request = editRequest();
  expect(
    await normalizeEditResponse(
      { kind: "clarification", message: "Which activity?", operations: [] },
      request,
      "ai",
    ),
  ).toEqual({ kind: "clarification", message: "Which activity?" });
  for (const invalid of [
    null,
    { ...wire(), operations: [] },
    { ...wire(), kind: "clarification" },
    { ...wire(), operations: [removeOperation(), removeOperation()] },
    { ...wire(), operations: Array(7).fill(removeOperation()) },
  ]) {
    await expect(
      normalizeEditResponse(invalid, request, "ai"),
    ).rejects.toThrow();
  }
});
it("validates scope and input before contacting the provider", async () => {
  await expect(
    proposeItineraryEdit({ ...editRequest(), message: "" }),
  ).rejects.toThrow();
  await expect(
    proposeItineraryEdit({
      ...editRequest(),
      scope: { dayId: "missing", activityId: null },
    }),
  ).rejects.toMatchObject({ code: "UNKNOWN_TARGET" });
  expect(create).not.toHaveBeenCalled();
});
it("rejects missing credentials without a paid call or mock fallback", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  await expect(proposeItineraryEdit(editRequest())).rejects.toMatchObject({
    code: "NOT_CONFIGURED",
  });
  expect(create).not.toHaveBeenCalled();
});
it("uses only explicitly enabled sample editing and explains empty days", async () => {
  vi.stubEnv("TRIP_GENERATION_MODE", "mock");
  vi.stubEnv("OPENAI_API_KEY", "");
  const result = await proposeItineraryEdit(editRequest());
  expect(result.kind).toBe("proposal");
  const empty = await proposeItineraryEdit({
    ...editRequest(),
    message: "Remove all activities on Day 2",
  });
  expect(empty).toMatchObject({
    kind: "clarification",
    message: expect.stringContaining("at least one activity"),
  });
  expect(create).not.toHaveBeenCalled();
});
it.each([
  [new OpenAI.APIConnectionTimeoutError(), "GENERATION_TIMEOUT"],
  [
    OpenAI.APIError.generate(
      401,
      { message: "private key" },
      "private key",
      new Headers(),
    ),
    "NOT_CONFIGURED",
  ],
  [
    OpenAI.APIError.generate(429, { message: "quota" }, "quota", new Headers()),
    "AI_UNAVAILABLE",
  ],
  [
    new OpenAI.APIConnectionError({ message: "secret network details" }),
    "AI_UNAVAILABLE",
  ],
  [new SyntaxError("private payload"), "INVALID_AI_RESPONSE"],
])("sanitizes provider failures (%s)", async (error, code) => {
  parse.mockRejectedValue(error);
  await expect(proposeItineraryEdit(editRequest())).rejects.toMatchObject({
    code,
  });
  expect(parse).toHaveBeenCalledTimes(1);
});
it("handles deadline and caller cancellation", async () => {
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
  parse.mockRejectedValue(new Error("aborted"));
  await expect(proposeItineraryEdit(editRequest())).rejects.toMatchObject({
    code: "GENERATION_TIMEOUT",
  });
  vi.restoreAllMocks();
  await expect(
    proposeItineraryEdit(editRequest(), AbortSignal.abort()),
  ).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
});
it.each([
  [{ status: "incomplete" }, "INCOMPLETE_AI_RESPONSE"],
  [
    {
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal" }] }],
    },
    "AI_REFUSAL",
  ],
  [
    { status: "completed", output: [], output_parsed: {} },
    "INVALID_AI_RESPONSE",
  ],
])("rejects incomplete/refused/invalid output", async (response, code) => {
  parse.mockResolvedValue(response);
  await expect(proposeItineraryEdit(editRequest())).rejects.toMatchObject({
    code,
  });
});
