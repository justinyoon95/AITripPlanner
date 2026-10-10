import "server-only";
import OpenAI from "openai";
import { GENERATION_TIMEOUT_MS } from "./config";

export function createOpenAIClient(apiKey: string) {
  return new OpenAI({ apiKey, timeout: GENERATION_TIMEOUT_MS, maxRetries: 0 });
}
