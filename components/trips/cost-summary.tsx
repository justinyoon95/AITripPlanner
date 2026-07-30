import type { GeneratedItinerary } from "@/lib/ai/itinerary-schema";
import {
  calculateBudgetUtilization,
  calculateDailyAverageCost,
  getBudgetStatus,
} from "@/lib/services/cost-analysis";
import { formatCents } from "@/lib/utils/money";

type CostSummaryProps = {
  itinerary: GeneratedItinerary;
  budgetCents: number;
  currency: string;
};

const budgetStatusLabels = {
  WITHIN_BUDGET: "Within budget",
  NEAR_BUDGET: "Near budget",
  OVER_BUDGET: "Over budget",
};

export function CostSummary({
  itinerary,
  budgetCents,
  currency,
}: CostSummaryProps) {
  const utilization = calculateBudgetUtilization(
    itinerary.totalEstimatedCostCents,
    budgetCents,
  );
  const averageDailyCost = calculateDailyAverageCost(itinerary);
  const status = getBudgetStatus(itinerary.totalEstimatedCostCents, budgetCents);

  return (
    <section className="grid gap-4 rounded-lg border bg-card p-5 text-card-foreground sm:grid-cols-3">
      <div>
        <p className="text-sm text-muted-foreground">Estimated total</p>
        <p className="mt-2 text-xl font-semibold tracking-normal">
          {formatCents(itinerary.totalEstimatedCostCents, currency)}
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Daily average</p>
        <p className="mt-2 text-xl font-semibold tracking-normal">
          {formatCents(averageDailyCost, currency)}
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Budget usage</p>
        <p className="mt-2 text-xl font-semibold tracking-normal">
          {utilization}%
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {budgetStatusLabels[status]}
        </p>
      </div>
    </section>
  );
}
