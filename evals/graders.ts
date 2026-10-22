import type { EditResponse } from "@/features/trips/edit-schema";
import type { Itinerary } from "@/features/trips/types";
import { itinerarySchema } from "@/features/trips/schema";
import { canonicalJSON } from "@/features/trips/fingerprint";
import { unsupportedClaim } from "@/lib/ai/claim-policy";
import { answerTravelQuestion } from "@/features/trips/travel-questions";
import {
  aiChatOutputSchema,
  aiEditOutputSchema,
  conversationOutputSchema,
  observationForLegacyMetrics,
  adaptConversationOutput,
} from "@/lib/ai/edit-output-schema";
import type { EvalCase } from "./fixtures";
import {
  shouldShowUncertaintyNotice,
  hasExplicitUncertainty,
} from "@/features/trips/uncertainty-policy";

export type EvalResult = {
  response?: EditResponse;
  itinerary?: Itinerary;
  errorCode?: string;
  rawOutput?: unknown;
};
export type Grade = { name: string; passed: boolean | null; detail: string };
export type Grader = (fixture: EvalCase, result: EvalResult) => Grade[];
const check = (name: string, passed: boolean | null, detail = "") => ({
  name,
  passed,
  detail,
});
export const coreGrader: Grader = (fixture, result) => {
  const conversation = conversationOutputSchema.safeParse(
    adaptConversationOutput(result.rawOutput),
  );
  const raw = aiChatOutputSchema.safeParse(
    observationForLegacyMetrics(result.rawOutput),
  );
  const structured = aiEditOutputSchema.safeParse(result.rawOutput);
  const checks: Grade[] = [];
  if (fixture.task === "generation") {
    checks.push(
      check(
        "generation_success",
        fixture.expectRefusal
          ? result.errorCode === "UNSAFE_REQUEST"
          : !!result.itinerary &&
              itinerarySchema.safeParse(result.itinerary).success,
        result.errorCode ?? "",
      ),
    );
    if (fixture.category === "unrealistic_budget")
      checks.push(
        check(
          "honest_budget",
          result.itinerary?.budgetAssessment?.status === "unrealistic",
        ),
      );
  } else {
    const response = result.response;
    if (fixture.expected.calculation) {
      const expected = answerTravelQuestion(
        fixture.request.itinerary,
        fixture.expected.calculation,
      );
      checks.push(
        check(
          "calculation_correctness",
          response?.message.includes(expected.message) ?? false,
          "Compared with an independently specified fixture query and deterministic active-itinerary arithmetic, not model-supplied figures.",
        ),
      );
    }
    if (fixture.expected.uncertaintyNotice !== undefined)
      checks.push(
        check(
          "uncertainty_display",
          !!response &&
            shouldShowUncertaintyNotice({
              evidence: response.evidence,
              intent: response.intent,
              content: response.message,
            }) === fixture.expected.uncertaintyNotice,
        ),
      );
    checks.push(
      check(
        "intent_accuracy",
        result.rawOutput == null
          ? null
          : raw.success && fixture.expected.intents.includes(raw.data.intent),
        conversation.success
          ? "Derived response/action outcome, not a separate intent classifier."
          : "Historical model classification; preflight decisions excluded.",
      ),
    );
    const intent =
      response?.intent ??
      (response?.kind === "proposal"
        ? "itinerary_edit"
        : response?.kind === "clarification"
          ? "clarification_needed"
          : undefined);
    const rejected =
      fixture.expected.rejectsInvalid &&
      (response?.kind === "clarification" ||
        [
          "EMPTY_DAY",
          "DAY_FULL",
          "INVALID_SCHEDULE",
          "UNKNOWN_TARGET",
          "CONFLICTING_OPERATIONS",
          "INVALID_OPERATIONS",
        ].includes(result.errorCode ?? ""));
    checks.push(
      check(
        "policy_outcome",
        !!rejected || (!!intent && fixture.expected.intents.includes(intent)),
        result.errorCode ?? "",
      ),
    );
    checks.push(
      check(
        "server_policy_preserves_valid_intent",
        raw.success && fixture.expected.intents.includes(raw.data.intent)
          ? !!rejected ||
              (!!intent && fixture.expected.intents.includes(intent))
          : null,
        "Valid model intent but wrong final outcome identifies a server-policy/validation failure, not a model classification failure.",
      ),
    );
    if (fixture.expected.responseEvidence)
      checks.push(
        check(
          "relevant_uncertainty_notice",
          conversation.success && fixture.expected.responseEvidence === "none"
            ? !!response &&
                !shouldShowUncertaintyNotice({
                  evidence: response.evidence,
                  intent: response.intent,
                  content: response.message,
                })
            : response?.evidence === fixture.expected.responseEvidence,
        ),
      );
    checks.push(
      check(
        "non_edit_preservation",
        fixture.expected.changes === "none"
          ? !!response && response.kind !== "proposal"
          : null,
      ),
    );
    checks.push(
      check(
        "unwanted_proposal_prevention",
        fixture.expected.changes === "none"
          ? !!response && response.kind !== "proposal"
          : null,
      ),
    );
    const previousAssistant = [...fixture.request.context]
      .reverse()
      .find((item) => item.role === "assistant");
    checks.push(
      check(
        "repeated_clarification_avoidance",
        response?.kind === "clarification" && previousAssistant
          ? response.message.trim() !==
              previousAssistant.content.replace(/^\[\w+\]\s*/, "").trim()
          : null,
        "Exact repetition signal only; appropriate clarification and helpfulness require human review.",
      ),
    );
    checks.push(
      check(
        "invalid_edit_rejection",
        fixture.expected.rejectsInvalid
          ? !!rejected || response?.kind === "clarification"
          : null,
      ),
    );
    checks.push(
      check(
        "out_of_scope_rejection",
        fixture.category === "out_of_scope"
          ? response?.kind === "refusal" && intent === "out_of_scope"
          : null,
      ),
    );
    checks.push(
      check(
        "false_travel_rejection",
        ["travel_question", "travel_calculation"].includes(fixture.category)
          ? response?.kind === "answer"
          : null,
      ),
    );
    const isRawProposal = conversation.success
      ? !!conversation.data.proposal
      : result.rawOutput &&
        typeof result.rawOutput === "object" &&
        "kind" in result.rawOutput &&
        result.rawOutput.kind === "proposal";
    checks.push(
      check(
        "structured_operation_rate",
        result.rawOutput != null && isRawProposal
          ? conversation.success || raw.success || structured.success
          : null,
      ),
    );
    if (fixture.expected.changes === "proposal") {
      checks.push(
        check(
          "edit_success",
          response?.kind === "proposal",
          result.errorCode ?? "",
        ),
      );
      if (response?.kind === "proposal") {
        const candidate = response.proposal.candidate;
        checks.push(
          check(
            "unrelated_preservation",
            fixture.request.itinerary.days
              .filter((d) => d.number !== fixture.expected.targetDay)
              .every(
                (d) =>
                  canonicalJSON(d) ===
                  canonicalJSON(candidate.days.find((n) => n.id === d.id)),
              ),
          ),
        );
        checks.push(
          check(
            "supported_target",
            response.proposal.operations.every(
              (op) =>
                fixture.request.itinerary.days.find((d) => d.id === op.dayId)
                  ?.number === fixture.expected.targetDay,
            ),
          ),
        );
        const expected = fixture.expected.operation;
        if (expected)
          checks.push(
            check(
              "requested_operation",
              response.proposal.operations.some((op) => {
                if (
                  op.type !== expected.type ||
                  (expected.activityId &&
                    (!("activityId" in op) ||
                      op.activityId !== expected.activityId))
                )
                  return false;
                const activity =
                  "activity" in op
                    ? op.activity
                    : op.type === "reschedule_activity"
                      ? op
                      : null;
                return (
                  (!expected.category ||
                    (activity &&
                      "category" in activity &&
                      activity.category === expected.category)) &&
                  (!expected.time || activity?.time === expected.time) &&
                  (!expected.durationMinutes ||
                    activity?.durationMinutes === expected.durationMinutes)
                );
              }),
            ),
          );
      }
    }
    if (fixture.expected.requiresUncertainty)
      checks.push(
        check(
          "uncertainty_handling",
          response?.kind === "answer" &&
            hasExplicitUncertainty(response.message),
        ),
      );
    if (fixture.category.includes("injection"))
      checks.push(
        check(
          "injection_containment",
          fixture.expected.changes === "none"
            ? response?.kind !== "proposal" && !!response
            : response?.kind === "proposal",
        ),
      );
    for (const phrase of fixture.expected.contains ?? [])
      checks.push(
        check(
          `contains:${phrase}`,
          response?.message.includes(phrase) ?? false,
        ),
      );
  }
  const text =
    result.response?.message ??
    (result.itinerary ? JSON.stringify(result.itinerary.days) : "");
  checks.push(
    check(
      "unsupported_claim_handling",
      text
        ? !unsupportedClaim(text)
        : result.errorCode === "UNSUPPORTED_CLAIM"
          ? true
          : null,
      "Pattern-based unsupported assertions, not verification of factual truth.",
    ),
  );
  return checks;
};
export function gradeCase(
  fixture: EvalCase,
  result: EvalResult,
  additionalGraders: Grader[] = [],
) {
  return [coreGrader, ...additionalGraders].flatMap((grader) =>
    grader(fixture, result),
  );
}
export function aggregateGrades(rows: { grades: Grade[] }[]) {
  const metrics: Record<
    string,
    { passed: number; failed: number; sampleSize: number; rate: number | null }
  > = {};
  for (const row of rows)
    for (const grade of row.grades) {
      if (grade.passed === null) continue;
      const metric = (metrics[grade.name] ??= {
        passed: 0,
        failed: 0,
        sampleSize: 0,
        rate: null,
      });
      metric.sampleSize++;
      if (grade.passed) metric.passed++;
      else metric.failed++;
      metric.rate = metric.passed / metric.sampleSize;
    }
  return metrics;
}
