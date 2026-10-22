import { it } from "vitest";
import { loadEnvConfig } from "@next/env";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { evaluationCases, DATASET_VERSION, FIXTURE_VERSION } from "./fixtures";
import {
  aggregateGrades,
  gradeCase,
  type EvalResult,
  type Grade,
} from "./graders";
import { evaluateBaseline, baselinePrompt, BASELINE_SHA } from "./baseline";
import { estimateCost, percentile, PRICING } from "./report";
import { proposeItineraryEdit } from "@/lib/ai/edit-service";
import { generateItinerary } from "@/lib/ai/itinerary-service";
import { generationConfig, outputTokenAllowance } from "@/lib/ai/config";
import { CHAT_PROMPT_VERSION, editInstructions } from "@/lib/ai/edit-prompts";
import {
  GENERATION_PROMPT_VERSION,
  itineraryInstructions,
} from "@/lib/ai/prompts";
import { tripDayCount } from "@/features/trips/schema";
import type { AIObservation } from "@/lib/ai/telemetry";
import {
  aiChatOutputSchema,
  aiEditOutputSchema,
  providerConversationSchema,
  observationForLegacyMetrics,
} from "@/lib/ai/edit-output-schema";
import { aiOutputSchemaForTrip } from "@/lib/ai/output-schema";
import { zodTextFormat } from "openai/helpers/zod";
import { requirePaidOptIn } from "./run-controls";
import { advanceContext } from "./conversation-context";
import type { EvalCase } from "./fixtures";

it("runs explicitly authorized real-model evaluations, never ordinary tests", async () => {
  // Require a shell opt-in BEFORE reading environment files.
  requirePaidOptIn(process.env.AI_EVAL_ALLOW_PAID);
  loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });
  const config = generationConfig();
  if (config.mode !== "ai")
    throw new Error("Live evaluations require TRIP_GENERATION_MODE=ai.");
  if (!/^gpt-4\.1-mini(?:-2025-04-14)?$/.test(config.model))
    throw new Error(
      "Cost reservation currently supports only GPT-4.1 Mini. Add reviewed pricing before evaluating another model.",
    );
  const limit = Number(process.env.AI_EVAL_LIMIT ?? 5);
  const repetitions = Number(process.env.AI_EVAL_REPETITIONS ?? 1);
  const budget = Number(process.env.AI_EVAL_BUDGET_USD ?? 1);
  const variant = process.env.AI_EVAL_VARIANT ?? "current";
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 60 ||
    !Number.isInteger(repetitions) ||
    repetitions < 1 ||
    repetitions > 3 ||
    !Number.isFinite(budget) ||
    budget <= 0 ||
    budget > 10 ||
    !["current", "baseline"].includes(variant)
  )
    throw new Error(
      "Invalid evaluation limits: 1-60 cases, 1-3 repetitions, budget (0,10], variant current/baseline.",
    );
  const category = process.env.AI_EVAL_CATEGORY;
  const selected = evaluationCases
    .filter((c) => !category || c.category === category)
    .slice(0, limit);
  if (!selected.length)
    throw new Error("No evaluation cases match that category.");
  const gitSHA = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const dirty = !!execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
  const diffHash = createHash("sha256")
    .update(execFileSync("git", ["diff", "HEAD"]))
    .digest("hex");
  const codeHash = createHash("sha256");
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter((path) =>
      /^(?:src\/|evals\/|tests\/|package(?:-lock)?\.json$|vitest\.config\.mts$|tsconfig\.json$)/.test(
        path,
      ),
    )
    .sort();
  for (const file of files) codeHash.update(file).update(readFileSync(file));
  const rows: {
    id: string;
    repetition: number;
    expectedIntents: string[] | null;
    observedIntent: string | null;
    grades: Grade[];
    errorCode?: string;
    latencyMs: number;
    observation: Omit<AIObservation, "rawOutput"> | null;
    estimatedCostUSD: number | null;
    paidCallAttempted: boolean;
    reservationUSD: number;
    reviewText?: string;
  }[] = [];
  let reserved = 0;
  let stoppedForBudget = false;
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    for (const scenario of selected) {
      let context = scenario.task === "chat" ? scenario.request.context : [];
      let pendingProposal =
        scenario.task === "chat" ? scenario.request.pendingProposal : null;
      const turns =
        scenario.task === "chat"
          ? (scenario.turns ?? [scenario.request.message])
          : [""];
      for (let turn = 0; turn < turns.length; turn++) {
        const fixture: EvalCase =
          scenario.task === "chat"
            ? {
                ...scenario,
                id:
                  turns.length > 1
                    ? `${scenario.id}/turn-${turn + 1}`
                    : scenario.id,
                request: {
                  ...scenario.request,
                  message: turns[turn],
                  context,
                  pendingProposal,
                },
                expected:
                  turn === turns.length - 1
                    ? scenario.expected
                    : (scenario.intermediateExpected ?? {
                        intents: ["travel_question", "clarification_needed"],
                        changes: "none",
                      }),
              }
            : scenario;
        const maxOutput =
          fixture.task === "chat"
            ? 4000
            : outputTokenAllowance(
                tripDayCount(fixture.input.startDate, fixture.input.endDate),
              );
        const prompt =
          variant === "baseline"
            ? baselinePrompt(fixture.task)
            : fixture.task === "chat"
              ? editInstructions
              : itineraryInstructions;
        const schema =
          fixture.task === "chat"
            ? variant === "baseline"
              ? aiEditOutputSchema
              : providerConversationSchema
            : aiOutputSchemaForTrip(fixture.input);
        // Byte-based reservation deliberately overestimates input; not a billing guarantee.
        const inputAllowance =
          Buffer.byteLength(JSON.stringify(fixture)) +
          Buffer.byteLength(prompt) +
          Buffer.byteLength(
            JSON.stringify(zodTextFormat(schema, "evaluation")),
          ) +
          2048;
        const reservationUSD =
          (inputAllowance * 0.4 + maxOutput * 1.6) / 1_000_000;
        if (reserved + reservationUSD > budget) {
          stoppedForBudget = true;
          break;
        }
        reserved += reservationUSD;
        let observation: AIObservation | undefined;
        const observer = (event: AIObservation) => {
          observation = event;
        };
        let result: EvalResult;
        const started = performance.now();
        try {
          result =
            variant === "baseline"
              ? await evaluateBaseline(fixture, observer)
              : fixture.task === "chat"
                ? {
                    response: await proposeItineraryEdit(
                      fixture.request,
                      undefined,
                      observer,
                    ),
                  }
                : {
                    itinerary: await generateItinerary(
                      fixture.input,
                      undefined,
                      observer,
                    ),
                  };
        } catch (error) {
          result = {
            errorCode:
              error &&
              typeof error === "object" &&
              "code" in error &&
              typeof error.code === "string"
                ? error.code
                : "EVAL_REQUEST_FAILED",
          };
        }
        if (fixture.task === "chat") {
          context = advanceContext(
            fixture.request,
            result.response,
            fixture.retainProposals,
          );
          if (fixture.retainProposals && result.response?.kind === "proposal") {
            const proposal = result.response.proposal;
            pendingProposal = {
              id: proposal.id,
              baseVersionId: proposal.baseVersionId,
              baseRevision: proposal.baseRevision,
              baseFingerprint: proposal.baseFingerprint,
              scope: proposal.scope,
              operations: proposal.operations,
            };
          }
        }
        const observed = observation as AIObservation | undefined;
        result.rawOutput = observed?.rawOutput;
        const latencyMs = performance.now() - started;
        const grades = gradeCase(fixture, result);
        const { rawOutput: _raw, ...safeObservation } = observed ?? {
          rawOutput: null,
        };
        void _raw;
        const rawIntent = aiChatOutputSchema.safeParse(
          observationForLegacyMetrics(observed?.rawOutput),
        );
        rows.push({
          id: fixture.id,
          repetition,
          expectedIntents:
            fixture.task === "chat" ? fixture.expected.intents : null,
          observedIntent: rawIntent.success ? rawIntent.data.intent : null,
          grades,
          errorCode: result.errorCode,
          latencyMs,
          observation: observed
            ? (safeObservation as Omit<AIObservation, "rawOutput">)
            : null,
          estimatedCostUSD: observed
            ? estimateCost(observed.model, observed.usage)
            : null,
          paidCallAttempted: !!observed,
          reservationUSD,
          reviewText:
            process.env.AI_EVAL_REVIEW_TEXT === "yes"
              ? result.response?.message
              : undefined,
        });
        console.log(
          `${fixture.id}: ${
            grades
              .filter((g) => g.passed === false)
              .map((g) => g.name)
              .join(", ") || "no automated grading failures"
          }${result.errorCode ? ` (${result.errorCode})` : ""}`,
        );
      }
      if (stoppedForBudget) break;
    }
    if (stoppedForBudget) break;
  }
  const report = {
    evaluationType: "real-model",
    datasetVersion: DATASET_VERSION,
    fixtureVersion: FIXTURE_VERSION,
    gitSHA,
    dirtyWorkingTree: dirty,
    trackedDiffHash: diffHash,
    codeSnapshotHash: codeHash.digest("hex"),
    datasetHash: createHash("sha256")
      .update(JSON.stringify(evaluationCases))
      .digest("hex"),
    nodeVersion: process.version,
    configuredModel: config.model,
    promptVersions:
      variant === "baseline"
        ? {
            chat: `phase3-${BASELINE_SHA}`,
            generation: `phase3-${BASELINE_SHA}`,
          }
        : { chat: CHAT_PROMPT_VERSION, generation: GENERATION_PROMPT_VERSION },
    testConfiguration: {
      variant,
      category: category ?? null,
      limit,
      repetitions,
      budgetUSD: budget,
      concurrency: 1,
      retries: 0,
      serverTimeoutMs: 90000,
      config: "evals/vitest.live.config.mts",
    },
    createdAt: new Date().toISOString(),
    pricing: PRICING,
    reservedUSD: reserved,
    stoppedForBudget,
    requestedSamples:
      selected.reduce(
        (sum, item) =>
          sum + (item.task === "chat" ? (item.turns?.length ?? 1) : 1),
        0,
      ) * repetitions,
    completedSamples: rows.length,
    failures: rows
      .filter((r) => r.grades.some((g) => g.passed === false) || r.errorCode)
      .map((r) => ({
        id: r.id,
        repetition: r.repetition,
        errorCode: r.errorCode,
        failedChecks: r.grades
          .filter((g) => g.passed === false)
          .map((g) => g.name),
      })),
    metrics: aggregateGrades(rows),
    intentConfusion: rows
      .filter((r) => r.expectedIntents && r.observation)
      .reduce<Record<string, Record<string, number>>>((matrix, row) => {
        const key = row.expectedIntents!.join("|");
        const observed = row.observedIntent ?? "missing_or_invalid";
        const counts = (matrix[key] ??= {});
        counts[observed] = (counts[observed] ?? 0) + 1;
        return matrix;
      }, {}),
    latency: {
      endToEndP50Ms: percentile(
        rows.map((r) => r.latencyMs),
        0.5,
      ),
      endToEndP95Ms: percentile(
        rows.map((r) => r.latencyMs),
        0.95,
      ),
      providerP50Ms: percentile(
        rows.flatMap((r) => (r.observation ? [r.observation.latencyMs] : [])),
        0.5,
      ),
      providerP95Ms: percentile(
        rows.flatMap((r) => (r.observation ? [r.observation.latencyMs] : [])),
        0.95,
      ),
    },
    knownTokens: {
      input: rows.reduce(
        (s, r) => s + (r.observation?.usage?.input_tokens ?? 0),
        0,
      ),
      cachedInput: rows.reduce(
        (s, r) =>
          s + (r.observation?.usage?.input_tokens_details?.cached_tokens ?? 0),
        0,
      ),
      output: rows.reduce(
        (s, r) => s + (r.observation?.usage?.output_tokens ?? 0),
        0,
      ),
    },
    estimatedKnownCostUSD: rows.reduce(
      (sum, r) => sum + (r.estimatedCostUSD ?? 0),
      0,
    ),
    samplesWithUsage: rows.filter((r) => r.observation?.usage).length,
    samplesWithoutUsage: rows.filter((r) => !r.observation?.usage).length,
    limitations: [
      "No raw provider prompts/responses or credentials are stored. Explicit AI_EVAL_REVIEW_TEXT=yes includes bounded validated assistant text for synthetic-fixture human review.",
      "Unknown usage is not zero cost; failed provider requests may be billed.",
      "Baseline freezes Phase 3 prompts/wire schema, not historical validators.",
      "Automated textual checks do not verify places or replace human semantic review.",
      "Conversation-first labels are derived response/action outcomes, not independent intent classifications. Sequential cases reuse actual preceding replies; any interim proposal is explicitly rejected by the harness, never accepted.",
    ],
    humanReview: selected
      .filter((item) => item.task === "chat" && item.humanReview)
      .map((item) => ({
        id: item.id,
        rubric: item.task === "chat" ? item.humanReview : [],
      })),
    rows,
  };
  mkdirSync("evals/reports", { recursive: true });
  const path = `evals/reports/${variant}-${Date.now()}.json`;
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(
    `Report: ${path}; samples ${rows.length}; failed cases ${report.failures.length}; budget stop ${stoppedForBudget}`,
  );
  if (report.failures.length || stoppedForBudget)
    throw new Error(
      "Evaluation has failures or incomplete coverage. See the generated report.",
    );
});
