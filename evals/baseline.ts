import { execFileSync } from "node:child_process";
import { zodTextFormat } from "openai/helpers/zod";
import { createOpenAIClient } from "@/lib/ai/client";
import {
  generationConfig,
  GENERATION_TIMEOUT_MS,
  outputTokenAllowance,
} from "@/lib/ai/config";
import { aiEditOutputSchema } from "@/lib/ai/edit-output-schema";
import { aiOutputSchemaForTrip } from "@/lib/ai/output-schema";
import { normalizeEditResponse } from "@/lib/ai/edit-service";
import { normalizeAIItinerary } from "@/lib/ai/itinerary-service";
import { editInput } from "@/lib/ai/edit-prompts";
import { itineraryInput } from "@/lib/ai/prompts";
import { tripDayCount } from "@/features/trips/schema";
import { observeResponse, type AIObserver } from "@/lib/ai/telemetry";
import type { EvalCase } from "./fixtures";
import type { EvalResult } from "./graders";

export const BASELINE_SHA = "09667a46d8060b54f52b0f04fff571aed283c990";
export function baselinePrompt(task: EvalCase["task"]) {
  const path =
    task === "chat" ? "src/lib/ai/edit-prompts.ts" : "src/lib/ai/prompts.ts";
  const source = execFileSync("git", ["show", `${BASELINE_SHA}:${path}`], {
    encoding: "utf8",
  });
  const name = task === "chat" ? "editInstructions" : "itineraryInstructions";
  const prompt = source.match(
    new RegExp(`export const ${name} = \x60([\\s\\S]*?)\x60;`),
  )?.[1];
  if (!prompt)
    throw new Error(
      "Frozen Phase 3 prompt is unavailable; baseline cannot run.",
    );
  return prompt;
}

// Frozen provider prompt/schema baseline; current deterministic validators remain
// in use. This is not an execution of the entire historical application.
export async function evaluateBaseline(
  fixture: EvalCase,
  observer: AIObserver,
): Promise<EvalResult> {
  const config = generationConfig();
  const response = await observeResponse(
    () =>
      createOpenAIClient(config.apiKey!).responses.parse(
        {
          model: config.model,
          instructions: baselinePrompt(fixture.task),
          input:
            fixture.task === "chat"
              ? editInput(fixture.request)
              : itineraryInput(fixture.input),
          text: {
            format:
              fixture.task === "chat"
                ? zodTextFormat(aiEditOutputSchema, "itinerary_edit")
                : zodTextFormat(
                    aiOutputSchemaForTrip(fixture.input),
                    "trip_itinerary",
                  ),
          },
          max_output_tokens:
            fixture.task === "chat"
              ? 4000
              : outputTokenAllowance(
                  tripDayCount(fixture.input.startDate, fixture.input.endDate),
                ),
          store: false,
        },
        { signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS) },
      ),
    { model: config.model, promptVersion: `phase3-${BASELINE_SHA}` },
    observer,
  );
  if (response.status === "incomplete" || !response.output_parsed)
    return { errorCode: "INCOMPLETE_AI_RESPONSE" };
  if (fixture.task === "chat")
    return {
      response: await normalizeEditResponse(
        response.output_parsed,
        fixture.request,
        "ai",
      ),
    };
  return {
    itinerary: normalizeAIItinerary(response.output_parsed, fixture.input),
  };
}
