import { canonicalJSON } from "./fingerprint";
import { summarizeCosts, summarizeDayCosts, roundMoney } from "./costs";
import type { Activity, Itinerary } from "./types";

export type ActivityChange = {
  dayNumber: number;
  before: Activity | null;
  after: Activity | null;
};
export function itineraryDiff(base: Itinerary, candidate: Itinerary) {
  const activities: ActivityChange[] = [];
  const dailyCosts: {
    dayNumber: number;
    before: number;
    after: number;
    beforeExtras: Itinerary["days"][number]["additionalCosts"];
    afterExtras: Itinerary["days"][number]["additionalCosts"];
  }[] = [];
  for (const day of base.days) {
    const next = candidate.days.find((item) => item.id === day.id)!;
    for (const before of day.activities) {
      const after =
        next.activities.find((item) => item.id === before.id) ?? null;
      if (canonicalJSON(before) !== canonicalJSON(after))
        activities.push({ dayNumber: day.number, before, after });
    }
    for (const after of next.activities)
      if (!day.activities.some((item) => item.id === after.id))
        activities.push({ dayNumber: day.number, before: null, after });
    if (
      canonicalJSON(day.additionalCosts ?? null) !==
      canonicalJSON(next.additionalCosts ?? null)
    )
      dailyCosts.push({
        dayNumber: day.number,
        before: summarizeDayCosts(day).total,
        after: summarizeDayCosts(next).total,
        beforeExtras: day.additionalCosts,
        afterExtras: next.additionalCosts,
      });
  }
  const beforeTotal = summarizeCosts(base).total;
  const afterTotal = summarizeCosts(candidate).total;
  return {
    activities,
    dailyCosts,
    beforeTotal,
    afterTotal,
    delta: roundMoney(afterTotal - beforeTotal),
  };
}
