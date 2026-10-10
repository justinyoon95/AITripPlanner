import "server-only";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  itinerarySchema,
  tripDayCount,
  tripInputSchema,
} from "@/features/trips/schema";
import { generateMockItinerary } from "@/features/trips/mock-generator";
import { roundMoney, summarizeCosts } from "@/features/trips/costs";
import type { Itinerary, TripInput } from "@/features/trips/types";
import { createOpenAIClient } from "./client";
import {
  generationConfig,
  GENERATION_TIMEOUT_MS,
  outputTokenAllowance,
} from "./config";
import { GenerationError } from "./errors";
import { aiOutputSchema, aiOutputSchemaForTrip } from "./output-schema";
import { itineraryInput, itineraryInstructions } from "./prompts";
import { validateGeneratedSchedule } from "./generation-requirements";

export function normalizeAIItinerary(
  raw: unknown,
  input: TripInput,
): Itinerary {
  const parsed = aiOutputSchema.safeParse(raw);
  if (!parsed.success)
    throw new GenerationError(
      "INVALID_AI_RESPONSE",
      "The AI returned an incomplete or invalid itinerary. Please try again.",
    );
  validateGeneratedSchedule(parsed.data, input);
  const result = itinerarySchema.safeParse({
    ...parsed.data,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    source: "ai",
    input,
    days: parsed.data.days.map((day) => ({
      ...day,
      id: randomUUID(),
      additionalCosts: Object.fromEntries(
        Object.entries(day.additionalCosts).map(([key, cost]) => [
          key,
          roundMoney(cost),
        ]),
      ),
      activities: day.activities.map((activity) => ({
        ...activity,
        id: randomUUID(),
        estimatedCost: roundMoney(activity.estimatedCost),
      })),
    })),
  });
  if (!result.success)
    throw new GenerationError(
      "INVALID_AI_RESPONSE",
      "The AI returned an invalid itinerary. No itinerary was saved. Please try again.",
    );
  const itinerary = result.data;
  if (summarizeCosts(itinerary).remaining < 0) {
    itinerary.budgetAssessment = {
      status: "unrealistic",
      explanation:
        "The estimated destination costs exceed your budget. Consider increasing your budget, shortening the trip, or adjusting accommodation and activities. Prices still need verification.",
    };
  }
  return itinerary;
}

export async function generateItinerary(
  rawInput: TripInput,
  callerSignal?: AbortSignal,
): Promise<Itinerary> {
  const input = tripInputSchema.parse(rawInput);
  const config = generationConfig();
  if (config.mode === "mock") {
    const mock = generateMockItinerary(input, randomUUID());
    return itinerarySchema.parse({
      ...mock,
      days: mock.days.map((day) => ({
        ...day,
        id: randomUUID(),
        activities: day.activities.map((activity) => ({
          ...activity,
          id: randomUUID(),
        })),
      })),
    });
  }
  const deadline = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
  const signal = callerSignal
    ? AbortSignal.any([deadline, callerSignal])
    : deadline;
  try {
    const response = await createOpenAIClient(config.apiKey!).responses.parse(
      {
        model: config.model,
        instructions: itineraryInstructions,
        input: itineraryInput(input),
        text: {
          format: zodTextFormat(aiOutputSchemaForTrip(input), "trip_itinerary"),
        },
        max_output_tokens: outputTokenAllowance(
          tripDayCount(input.startDate, input.endDate),
        ),
        store: false,
      },
      { signal },
    );
    if (response.status === "incomplete")
      throw new GenerationError(
        "INCOMPLETE_AI_RESPONSE",
        "The itinerary could not be completed within the generation limit. Try a shorter trip or try again.",
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
        "The AI could not generate this itinerary. Please adjust your preferences and try again.",
        422,
      );
    return normalizeAIItinerary(response.output_parsed, input);
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    if (deadline.aborted || error instanceof OpenAI.APIConnectionTimeoutError)
      throw new GenerationError(
        "GENERATION_TIMEOUT",
        "Generation took too long. Please try again, or choose a shorter trip.",
        504,
      );
    if (callerSignal?.aborted)
      throw new GenerationError(
        "REQUEST_CANCELLED",
        "Trip generation was cancelled.",
        499,
      );
    if (error instanceof OpenAI.APIError && error.status === 429)
      throw new GenerationError(
        "AI_UNAVAILABLE",
        "AI generation is temporarily unavailable or its usage allowance has been reached. Please try again later.",
        503,
      );
    if (
      error instanceof OpenAI.APIError &&
      (error.status === 401 || error.status === 403)
    )
      throw new GenerationError(
        "NOT_CONFIGURED",
        "AI generation credentials could not be accepted. Check the server configuration.",
        503,
      );
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && error.name === "ZodError")
    )
      throw new GenerationError(
        "INVALID_AI_RESPONSE",
        "The AI returned an invalid itinerary. Please try again.",
      );
    throw new GenerationError(
      "AI_UNAVAILABLE",
      "We couldn't reach AI trip generation. Please try again later.",
      502,
    );
  }
}
