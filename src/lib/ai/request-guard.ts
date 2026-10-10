import "server-only";
import { GenerationError } from "./errors";

const MAX_ENTRIES = 200;
export const GENERATION_COOLDOWN_MS = 20_000;

export function createGenerationGuard() {
  const entries = new Map<string, number>();
  return {
    acquire(key: string) {
      const now = Date.now();
      for (const [entryKey, expires] of entries)
        if (expires <= now) entries.delete(entryKey);
      if (entries.has(key))
        throw new GenerationError(
          "DUPLICATE_REQUEST",
          "This trip was just requested or is still being generated. Please wait a moment before trying again.",
          429,
        );
      if (entries.size >= MAX_ENTRIES)
        throw new GenerationError(
          "GENERATION_BUSY",
          "Trip generation is busy. Please try again shortly.",
          503,
        );
      entries.set(key, now + 120_000);
      return () => entries.set(key, Date.now() + GENERATION_COOLDOWN_MS);
    },
  };
}

export const generationGuard = createGenerationGuard();
