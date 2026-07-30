import { describe, expect, it } from "vitest";

import {
  calculateBudgetUtilization,
  calculateDailyAverageCost,
  getBudgetStatus,
} from "@/lib/services/cost-analysis";

const itinerary = {
  totalEstimatedCostCents: 30000,
  days: [
    {
      dayNumber: 1,
      date: "2026-07-01",
      summary: "Day one",
      estimatedCostCents: 10000,
      activities: [],
    },
    {
      dayNumber: 2,
      date: "2026-07-02",
      summary: "Day two",
      estimatedCostCents: 20000,
      activities: [],
    },
  ],
};

describe("cost analysis helpers", () => {
  it("calculates budget utilization percentage", () => {
    expect(calculateBudgetUtilization(7500, 10000)).toBe(75);
  });

  it("calculates daily average cost", () => {
    expect(calculateDailyAverageCost(itinerary)).toBe(15000);
  });

  it("labels trips within budget", () => {
    expect(getBudgetStatus(8000, 10000)).toBe("WITHIN_BUDGET");
  });

  it("labels trips near budget", () => {
    expect(getBudgetStatus(9000, 10000)).toBe("NEAR_BUDGET");
  });

  it("labels trips over budget", () => {
    expect(getBudgetStatus(11000, 10000)).toBe("OVER_BUDGET");
  });
});
