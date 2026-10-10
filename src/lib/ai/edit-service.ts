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
import { aiEditOutputSchema } from "./edit-output-schema";
import { editInput, editInstructions } from "./edit-prompts";
import { mockEdit } from "./mock-editor";

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
      operation.type === "add_activity"
        ? {
            ...operation,
            activity: { ...operation.activity, id: randomUUID() },
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
): Promise<EditResponse> {
  const request = editRequestSchema.parse(raw);
  validateEditScope(request);
  const config = generationConfig();
  if (config.mode === "mock")
    return normalizeEditResponse(mockEdit(request), request, "mock");
  const deadline = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
  const signal = callerSignal
    ? AbortSignal.any([deadline, callerSignal])
    : deadline;
  try {
    const response = await createOpenAIClient(config.apiKey!).responses.parse(
      {
        model: config.model,
        instructions: editInstructions,
        input: editInput(request),
        text: { format: zodTextFormat(aiEditOutputSchema, "itinerary_edit") },
        max_output_tokens: MAX_EDIT_OUTPUT_TOKENS,
        store: false,
      },
      { signal },
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
    return await normalizeEditResponse(response.output_parsed, request, "ai");
  } catch (error) {
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
