import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateItinerary,
  normalizeAIItinerary,
} from "@/lib/ai/itinerary-service";
import { outputTokenAllowance, generationConfig } from "@/lib/ai/config";
import { summarizeCosts, summarizeDayCosts } from "@/features/trips/costs";
import { itinerarySchema } from "@/features/trips/schema";
import { aiFixture, input } from "./fixtures";

const { parse, create } = vi.hoisted(() => ({
  parse: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/ai/client", () => ({ createOpenAIClient: create }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
  vi.stubEnv("TRIP_GENERATION_MODE", "ai");
  vi.stubEnv("OPENAI_MODEL", "gpt-4.1-mini");
  create.mockReturnValue({ responses: { parse } });
  parse.mockResolvedValue({
    status: "completed",
    output: [],
    output_parsed: aiFixture(),
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("AI contract and normalization", () => {
  it("assigns unique server IDs and computes complete costs", () => {
    const result = normalizeAIItinerary(aiFixture(), input);
    expect(itinerarySchema.safeParse(result).success).toBe(true);
    const ids = [
      result.id,
      ...result.days.flatMap((day) => [
        day.id,
        ...day.activities.map((activity) => activity.id),
      ]),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[0-9a-f-]{36}$/));
    expect(summarizeDayCosts(result.days[0]).total).toBe(135);
    expect(summarizeCosts(result).total).toBe(325);
    expect(normalizeAIItinerary(aiFixture(), input).id).not.toBe(result.id);
  });
  it("rounds estimates and reports over-budget trips without lowering costs", () => {
    const wire = aiFixture();
    wire.days[0].activities[0].estimatedCost = 10.129;
    const result = normalizeAIItinerary(wire, { ...input, budget: 1 });
    expect(result.days[0].activities[0].estimatedCost).toBe(10.13);
    expect(result.budgetAssessment?.status).toBe("unrealistic");
    expect(summarizeCosts(result).total).toBe(325.13);
  });
  it.each(["missing", "dates", "pace", "overlap", "negative"])(
    "rejects %s output",
    (kind) => {
      const wire = aiFixture();
      if (kind === "missing")
        return expect(() => normalizeAIItinerary({}, input)).toThrow();
      if (kind === "dates") wire.days[1].date = wire.days[0].date;
      if (kind === "pace") wire.days[0].activities.pop();
      if (kind === "overlap")
        wire.days[0].activities[1].time = wire.days[0].activities[0].time;
      if (kind === "negative") wire.days[0].additionalCosts.accommodation = -1;
      expect(() => normalizeAIItinerary(wire, input)).toThrow();
    },
  );
  it("supports 14 days and rejects day/activity ID collisions", () => {
    const longInput = { ...input, endDate: "2026-12-14" };
    const result = normalizeAIItinerary(aiFixture(longInput), longInput);
    expect(result.days).toHaveLength(14);
    result.days[0].id = result.days[0].activities[0].id;
    expect(itinerarySchema.safeParse(result).success).toBe(false);
  });
});

describe("OpenAI generation", () => {
  it("requests strict structured output with a duration allowance and no response storage", async () => {
    const result = await generateItinerary(input);
    expect(result.source).toBe("ai");
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4.1-mini",
        max_output_tokens: outputTokenAllowance(3),
        store: false,
        text: {
          format: expect.objectContaining({
            type: "json_schema",
            strict: true,
            name: "trip_itinerary",
          }),
        },
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(create).toHaveBeenCalledWith("test-key-not-real");
    expect(JSON.parse(parse.mock.calls[0][0].input)).toMatchObject({
      inclusiveDayCount: 3,
      activitiesPerDay: 3,
      requiredDays: [
        { number: 1, date: "2026-12-01" },
        { number: 2, date: "2026-12-02" },
        { number: 3, date: "2026-12-03" },
      ],
    });
    expect(
      parse.mock.calls[0][0].text.format.schema.properties.days,
    ).toMatchObject({ minItems: 3, maxItems: 3 });
  });
  it("scales token budgets with a hard cap", () => {
    expect(outputTokenAllowance(1)).toBe(1850);
    expect(outputTokenAllowance(3)).toBe(3550);
    expect(outputTokenAllowance(14)).toBe(12000);
    expect(() => outputTokenAllowance(15)).toThrow();
  });
  it("uses the explicitly configured model", async () => {
    vi.stubEnv("OPENAI_MODEL", "test-structured-model");
    await generateItinerary(input);
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-structured-model" }),
      expect.anything(),
    );
  });
  it("rejects invalid input before contacting OpenAI", async () => {
    await expect(
      generateItinerary({ ...input, endDate: "2026-12-15" }),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it("rejects missing credentials before creating the client", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(generateItinerary(input)).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
      status: 503,
    });
    expect(create).not.toHaveBeenCalled();
  });
  it("uses only explicit development mock mode, never in production", async () => {
    vi.stubEnv("TRIP_GENERATION_MODE", "mock");
    vi.stubEnv("OPENAI_API_KEY", "");
    expect((await generateItinerary(input)).source).toBe("mock");
    expect(create).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "production");
    expect(() => generationConfig()).toThrow();
  });
  it("rejects unknown configuration modes", () => {
    vi.stubEnv("TRIP_GENERATION_MODE", "silent-fallback");
    expect(() => generationConfig()).toThrow();
  });
  it.each([
    [new OpenAI.APIConnectionTimeoutError(), "GENERATION_TIMEOUT", 504],
    [
      new OpenAI.APIConnectionError({ message: "secret transport details" }),
      "AI_UNAVAILABLE",
      502,
    ],
    [
      OpenAI.APIError.generate(
        429,
        { message: "quota" },
        "quota",
        new Headers(),
      ),
      "AI_UNAVAILABLE",
      503,
    ],
    [
      OpenAI.APIError.generate(401, { message: "key" }, "key", new Headers()),
      "NOT_CONFIGURED",
      503,
    ],
    [new SyntaxError("provider data"), "INVALID_AI_RESPONSE", 502],
  ])(
    "maps provider failures to safe errors (%s)",
    async (error, code, status) => {
      parse.mockRejectedValue(error);
      await expect(generateItinerary(input)).rejects.toMatchObject({
        code,
        status,
      });
      expect(parse).toHaveBeenCalledTimes(1);
    },
  );
  it("enforces the server deadline", async () => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    parse.mockRejectedValue(new Error("aborted"));
    await expect(generateItinerary(input)).rejects.toMatchObject({
      code: "GENERATION_TIMEOUT",
    });
  });
  it("propagates caller cancellation", async () => {
    parse.mockRejectedValue(new Error("aborted"));
    await expect(
      generateItinerary(input, AbortSignal.abort()),
    ).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
  });
  it("rejects incomplete, refused, and malformed responses without fallback", async () => {
    parse.mockResolvedValueOnce({ status: "incomplete" });
    await expect(generateItinerary(input)).rejects.toMatchObject({
      code: "INCOMPLETE_AI_RESPONSE",
    });
    parse.mockResolvedValueOnce({
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal" }] }],
    });
    await expect(generateItinerary(input)).rejects.toMatchObject({
      code: "AI_REFUSAL",
    });
    parse.mockResolvedValueOnce({
      status: "completed",
      output: [],
      output_parsed: null,
    });
    await expect(generateItinerary(input)).rejects.toMatchObject({
      code: "INVALID_AI_RESPONSE",
    });
  });
});
