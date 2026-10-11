import type { ResponseUsage } from "openai/resources/responses/responses";

export const PRICING = {
  model: "gpt-4.1-mini",
  inputPerMillionUSD: 0.4,
  cachedPerMillionUSD: 0.1,
  outputPerMillionUSD: 1.6,
  checkedOn: "2026-10-10",
  source: "https://developers.openai.com/api/docs/models/gpt-4.1-mini",
};
export function estimateCost(
  model: string,
  usage: ResponseUsage | null,
): number | null {
  if (!usage || !/^gpt-4\.1-mini(?:-2025-04-14)?$/.test(model)) return null;
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  return (
    ((usage.input_tokens - cached) * PRICING.inputPerMillionUSD +
      cached * PRICING.cachedPerMillionUSD +
      usage.output_tokens * PRICING.outputPerMillionUSD) /
    1_000_000
  );
}
export function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}
