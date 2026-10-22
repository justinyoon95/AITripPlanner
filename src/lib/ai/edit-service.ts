import "server-only";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  editRequestSchema,
  editResponseSchema,
  editOperationsSchema,
  EditError,
  type EditRequest,
  type EditResponse,
} from "@/features/trips/edit-schema";
import {
  applyEditOperations,
  describeEdits,
} from "@/features/trips/edit-engine";
import { itineraryFingerprint } from "@/features/trips/fingerprint";
import { generationConfig, GENERATION_TIMEOUT_MS } from "./config";
import { createOpenAIClient } from "./client";
import { GenerationError } from "./errors";
import {
  aiEditOutputSchema,
  providerConversationSchema,
} from "./edit-output-schema";
import {
  editInput,
  editInstructions,
  CHAT_PROMPT_VERSION,
} from "./edit-prompts";
import { securityBoundary } from "./chat-policy";
import { normalizeConversation } from "./conversation-normalizer";
import { mockConversation } from "./mock-conversation";
import { observeResponse, type AIObserver } from "./telemetry";
import { conversationDiagnostic } from "./conversation-diagnostics";
import { validateStoredGeography } from "@/lib/validate-trip";
import { locateActivity } from "@/features/trips/activity-locations";

export const MAX_EDIT_OUTPUT_TOKENS = 4000;
export function validateEditScope(request: EditRequest) {
  if (!request.scope) return;
  const day = request.itinerary.days.find(
    (item) => item.id === request.scope!.dayId,
  );
  if (
    !day ||
    (request.scope.activityId &&
      !day.activities.some((item) => item.id === request.scope!.activityId))
  )
    throw new EditError(
      "UNKNOWN_TARGET",
      "The selected day or activity is no longer available. Please select it again.",
    );
}
export async function normalizeEditResponse(
  raw: unknown,
  request: EditRequest,
  source: "ai" | "mock",
): Promise<EditResponse> {
  const parsed = aiEditOutputSchema.safeParse(raw);
  if (!parsed.success)
    throw new GenerationError(
      "INVALID_AI_RESPONSE",
      "The AI returned invalid changes. Please request a smaller, more specific edit.",
    );
  const wire = parsed.data;
  if (wire.kind === "proposal" && wire.operations.length === 0)
    throw new GenerationError(
      "INVALID_AI_RESPONSE",
      "The AI returned no changes. Please describe a specific edit.",
    );
  if (wire.kind === "clarification") {
    if (wire.operations.length)
      throw new GenerationError(
        "INVALID_AI_RESPONSE",
        "The AI returned conflicting clarification and changes. Please try again.",
      );
    return { kind: "clarification", message: wire.message };
  }
  const operations = editOperationsSchema.parse(
    wire.operations.map((operation) =>
      operation.type === "add_activity" || operation.type === "replace_activity"
        ? {
            ...operation,
            activity: {
              ...locateActivity(operation.activity, request.itinerary.input),
              durationSource: source === "ai" ? "ai_estimate" : "unknown",
              ...(operation.type === "add_activity"
                ? { id: randomUUID() }
                : {}),
            },
          }
        : operation,
    ),
  );
  const candidate = applyEditOperations(
    request.itinerary,
    operations,
    request.scope,
  );
  return editResponseSchema.parse({
    kind: "proposal",
    message: wire.message,
    proposal: {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      source,
      baseVersionId: request.baseVersionId,
      baseRevision: request.baseRevision,
      baseFingerprint: await itineraryFingerprint(request.itinerary),
      scope: request.scope,
      operations,
      candidate,
      summary: describeEdits(request.itinerary, operations),
    },
  });
}
export async function proposeItineraryEdit(
  raw: EditRequest,
  callerSignal?: AbortSignal,
  observer?: AIObserver,
): Promise<EditResponse> {
  const request = editRequestSchema.parse(raw);
  validateStoredGeography(request.itinerary.input);
  validateEditScope(request);
  if (request.pendingProposal) {
    const pending = request.pendingProposal;
    if (
      pending.baseVersionId !== request.baseVersionId ||
      pending.baseRevision !== request.baseRevision ||
      pending.baseFingerprint !==
        (await itineraryFingerprint(request.itinerary))
    ) {
      conversationDiagnostic("pending_proposal", "STALE_PROPOSAL");
      throw new EditError(
        "STALE_PROPOSAL",
        "That proposal is no longer based on the active itinerary. Reject it and request a new proposal.",
      );
    }
    // Rebuild against the active snapshot, not a browser-supplied candidate.
    applyEditOperations(request.itinerary, pending.operations, pending.scope);
  }
  const boundary = securityBoundary(request);
  if (boundary) return boundary;
  const config = generationConfig();
  if (config.mode === "mock") {
    return normalizeConversation(mockConversation(request), request, (raw) =>
      normalizeEditResponse(raw, request, "mock"),
    );
  }
  const deadline = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
  const signal = callerSignal
    ? AbortSignal.any([deadline, callerSignal])
    : deadline;
  try {
    const response = await observeResponse(
      () =>
        createOpenAIClient(config.apiKey!).responses.parse(
          {
            model: config.model,
            instructions: editInstructions,
            input: editInput(request),
            text: {
              format: zodTextFormat(
                providerConversationSchema,
                "travel_conversation_v38",
              ),
            },
            max_output_tokens: MAX_EDIT_OUTPUT_TOKENS,
            store: false,
          },
          { signal },
        ),
      { model: config.model, promptVersion: CHAT_PROMPT_VERSION },
      observer,
    );
    if (response.status === "incomplete")
      throw new GenerationError(
        "INCOMPLETE_AI_RESPONSE",
        "The edit was too complex to complete within the limit. Please request fewer changes.",
      );
    if (
      response.output.some(
        (item) =>
          item.type === "message" &&
          item.content.some((content) => content.type === "refusal"),
      )
    )
      throw new GenerationError(
        "AI_REFUSAL",
        "The AI could not propose this edit. Please adjust your request.",
        422,
      );
    return await normalizeConversation(response.output_parsed, request, (raw) =>
      normalizeEditResponse(raw, request, "ai"),
    );
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && error.name === "ZodError")
    )
      conversationDiagnostic("schema", "PROVIDER_PARSE_FAILED");
    if (error instanceof GenerationError || error instanceof EditError)
      throw error;
    if (deadline.aborted || error instanceof OpenAI.APIConnectionTimeoutError)
      throw new GenerationError(
        "GENERATION_TIMEOUT",
        "The edit took too long. Your itinerary is unchanged; try a smaller request.",
        504,
      );
    if (callerSignal?.aborted)
      throw new GenerationError(
        "REQUEST_CANCELLED",
        "The edit request was cancelled.",
        499,
      );
    if (
      error instanceof OpenAI.APIError &&
      (error.status === 401 || error.status === 403)
    )
      throw new GenerationError(
        "NOT_CONFIGURED",
        "AI editing credentials could not be accepted. Check the server configuration.",
        503,
      );
    if (error instanceof OpenAI.APIError && error.status === 429)
      throw new GenerationError(
        "AI_UNAVAILABLE",
        "AI editing is temporarily unavailable or its usage allowance has been reached. Please try again later.",
        503,
      );
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && error.name === "ZodError")
    )
      throw new GenerationError(
        "INVALID_AI_RESPONSE",
        "The AI returned invalid changes. Please request a smaller edit.",
      );
    throw new GenerationError(
      "AI_UNAVAILABLE",
      "We couldn't reach AI editing. Your itinerary is unchanged; please try again later.",
    );
  }
}
