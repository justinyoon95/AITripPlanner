import { describe, expect, it } from "vitest";
import {
  evaluationCases,
  fixtureRequest,
  DATASET_VERSION,
  integrationEvaluationCases,
} from "../evals/fixtures";
import { aggregateGrades, gradeCase } from "../evals/graders";
import { estimateCost, percentile } from "../evals/report";
import { baselinePrompt } from "../evals/baseline";
import { requirePaidOptIn } from "../evals/run-controls";
import { editRequestSchema } from "@/features/trips/edit-schema";
import { tripInputSchema } from "@/features/trips/schema";
import { normalizeChatResponse } from "@/lib/ai/chat-normalizer";
import { normalizeEditResponse } from "@/lib/ai/edit-service";

describe("versioned evaluation fixtures and independent graders", () => {
  it("grades mixed arithmetic independently from edit success", async () => {
    const fixture = integrationEvaluationCases.find(
      (item) => item.id === "integration-mixed-dinner",
    )!;
    const response = {
      kind: "answer" as const,
      intent: "travel_question" as const,
      evidence: "itinerary_estimates" as const,
      message: "Current itinerary: incorrect $999",
    };
    expect(
      gradeCase(fixture, { response }).find(
        (grade) => grade.name === "calculation_correctness",
      )?.passed,
    ).toBe(false);
  });
  it("uses reproducible synthetic fixtures with no provider calls", () => {
    expect(fixtureRequest("question")).toEqual(fixtureRequest("question"));
    expect(DATASET_VERSION).toBe("travel-reliability-v5");
    expect(evaluationCases).toHaveLength(115);
    expect(new Set(evaluationCases.map((c) => c.id)).size).toBe(
      evaluationCases.length,
    );
    for (const c of evaluationCases)
      expect(
        c.task === "chat"
          ? editRequestSchema.safeParse(c.request).success
          : tripInputSchema.safeParse(c.input).success,
      ).toBe(true);
    expect(new Set(evaluationCases.map((c) => c.category))).toEqual(
      new Set([
        "valid_edit",
        "travel_question",
        "travel_calculation",
        "ambiguous",
        "out_of_scope",
        "invalid_edit",
        "factual_uncertainty",
        "injection",
        "multi_turn",
        "embedded_injection",
        "generation",
        "unrealistic_budget",
        "unsupported_setting",
        "conversational_followup",
        "conversation_first",
        "conversation_integration",
      ]),
    );
  });
  it("grades real target preservation independently of assistant prose", async () => {
    const c = evaluationCases.find((c) => c.id === "valid_edit-2")!;
    if (c.task !== "chat") throw new Error("Expected chat");
    const day = c.request.itinerary.days[1];
    const raw = {
      intent: "itinerary_edit",
      kind: "proposal",
      message: "One fewer stop",
      operations: [
        {
          type: "remove_activity",
          dayId: day.id,
          activityId: day.activities[2].id,
        },
      ],
      question: null,
    };
    const response = await normalizeChatResponse(raw, c.request, (wire) =>
      normalizeEditResponse(wire, c.request, "ai"),
    );
    expect(
      gradeCase(c, { response, rawOutput: raw }).every(
        (g) => g.passed !== false,
      ),
    ).toBe(true);
    if (response.kind === "proposal")
      response.proposal.candidate.days[0].title = "hidden change";
    expect(
      gradeCase(c, { response, rawOutput: raw }).find(
        (g) => g.name === "unrelated_preservation",
      )?.passed,
    ).toBe(false);
  });
  it("reports invalid structured proposals as failures rather than dropping samples", () => {
    const c = evaluationCases[0];
    expect(
      gradeCase(c, {
        rawOutput: {
          kind: "proposal",
          operations: [{ type: "delete_history" }],
        },
      }).find((g) => g.name === "structured_operation_rate")?.passed,
    ).toBe(false);
  });
  it("distinguishes model classification from a valid intent rejected by server policy", () => {
    const c = evaluationCases.find((c) => c.id === "natural-edit-0")!;
    const rawOutput = {
      intent: "itinerary_edit",
      kind: "proposal",
      question: null,
      message: "Remove a stop",
      operations: [],
    };
    const checks = gradeCase(c, {
      rawOutput,
      response: {
        kind: "clarification",
        intent: "clarification_needed",
        message: "Which operation?",
        evidence: "none",
      },
    });
    expect(checks.find((c) => c.name === "intent_accuracy")?.passed).toBe(true);
    expect(
      checks.find((c) => c.name === "server_policy_preserves_valid_intent")
        ?.passed,
    ).toBe(false);
    const misclassified = gradeCase(c, {
      rawOutput: {
        ...rawOutput,
        intent: "clarification_needed",
        kind: "clarification",
      },
    });
    expect(
      misclassified.find((c) => c.name === "intent_accuracy")?.passed,
    ).toBe(false);
    expect(
      misclassified.find(
        (c) => c.name === "server_policy_preserves_valid_intent",
      )?.passed,
    ).toBeNull();
  });
  it("exposes unsupported baseline behavior and missing usage honestly", () => {
    const c = evaluationCases.find((c) => c.category === "travel_question")!;
    expect(
      gradeCase(c, {
        response: { kind: "clarification", message: "Which edit?" },
        rawOutput: {
          kind: "clarification",
          message: "Which edit?",
          operations: [],
        },
      }).find((g) => g.name === "intent_accuracy")?.passed,
    ).toBe(false);
    expect(estimateCost("gpt-4.1-mini", null)).toBeNull();
    expect(
      estimateCost("unknown", {
        input_tokens: 100,
        output_tokens: 100,
      } as never),
    ).toBeNull();
  });
  it("aggregates failures and denominators, ignoring only not-applicable checks", () => {
    const result = aggregateGrades([
      {
        grades: [
          { name: "x", passed: true, detail: "" },
          { name: "x", passed: false, detail: "" },
          { name: "x", passed: null, detail: "" },
        ],
      },
    ]);
    expect(result.x).toEqual({
      passed: 1,
      failed: 1,
      sampleSize: 2,
      rate: 0.5,
    });
    expect(percentile([], 0.95)).toBeNull();
    expect(percentile([20, 10, 30], 0.5)).toBe(20);
  });
  it("allows future evidence/tool graders without changing the core fixture contract", () => {
    const fixture = structuredClone(evaluationCases[0]);
    fixture.evidence = [
      {
        id: "trusted-place",
        provider: "test-provider",
        source: "fixture",
        observedAt: "2026-01-01T00:00:00Z",
        fields: { accessible: true },
      },
    ];
    expect(
      gradeCase(fixture, {}, [
        (c) => [
          {
            name: "grounded_fixture_present",
            passed: c.evidence.length === 1,
            detail: "Synthetic trusted test evidence, not live verification",
          },
        ],
      ]).at(-1)?.passed,
    ).toBe(true);
  });
  it("requires exact opt-in and reads frozen baseline prompts without evaluating source code", () => {
    for (const flag of [undefined, "true", "no"])
      expect(() => requirePaidOptIn(flag)).toThrow(/Paid calls disabled/);
    expect(() => requirePaidOptIn("yes")).not.toThrow();
    expect(baselinePrompt("chat")).toContain("targeted travel itinerary edits");
    expect(baselinePrompt("generation")).toContain(
      "careful travel planning assistant",
    );
  });
});
