import "server-only";
import { MAX_TRIP_DAYS } from "@/features/trips/schema";
import { GenerationError } from "./errors";

export const GENERATION_TIMEOUT_MS = 90_000;
export const MAX_OUTPUT_TOKENS = 12_000;
export function outputTokenAllowance(days: number) {
  if (!Number.isInteger(days) || days < 1 || days > MAX_TRIP_DAYS)
    throw new GenerationError(
      "INVALID_REQUEST",
      "Trips must be between 1 and 14 days.",
      400,
    );
  return Math.min(MAX_OUTPUT_TOKENS, 1_000 + days * 850);
}
export function generationConfig() {
  const mode = process.env.TRIP_GENERATION_MODE ?? "ai";
  if (mode !== "ai" && mode !== "mock")
    throw new GenerationError(
      "CONFIGURATION_ERROR",
      "Trip generation is not configured correctly.",
      503,
    );
  if (mode === "mock" && process.env.NODE_ENV === "production")
    throw new GenerationError(
      "CONFIGURATION_ERROR",
      "Development sample mode is unavailable in production.",
      503,
    );
  if (mode === "ai" && !process.env.OPENAI_API_KEY?.trim())
    throw new GenerationError(
      "NOT_CONFIGURED",
      "AI trip generation is not configured. Add an OpenAI API key on the server, or explicitly enable development sample mode.",
      503,
    );
  return {
    mode,
    apiKey: process.env.OPENAI_API_KEY?.trim(),
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
  };
}
