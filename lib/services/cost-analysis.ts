import type { GeneratedItinerary } from "@/lib/ai/itinerary-schema";

export function calculateBudgetUtilization(
  estimatedCostCents: number,
  budgetCents: number,
) {
  if (budgetCents <= 0) {
    return 0;
  }

  return Math.round((estimatedCostCents / budgetCents) * 100);
}

export function calculateDailyAverageCost(itinerary: GeneratedItinerary) {
  if (itinerary.days.length === 0) {
    return 0;
  }

  return Math.round(itinerary.totalEstimatedCostCents / itinerary.days.length);
}

export function getBudgetStatus(
  estimatedCostCents: number,
  budgetCents: number,
) {
  const utilization = calculateBudgetUtilization(
    estimatedCostCents,
    budgetCents,
  );

  if (utilization > 100) {
    return "OVER_BUDGET";
  }

  if (utilization >= 85) {
    return "NEAR_BUDGET";
  }

  return "WITHIN_BUDGET";
}
