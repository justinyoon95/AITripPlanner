import { expect, it } from "vitest";
import { generateMockItinerary } from "@/features/trips/mock-generator";
import { answerTravelQuestion } from "@/features/trips/travel-questions";
import { normalizeConversation } from "@/lib/ai/conversation-normalizer";
import { normalizeEditResponse } from "@/lib/ai/edit-service";
import { createSession } from "@/features/trips/versioning";
import { summarizeDayCosts } from "@/features/trips/costs";
import type { TravelQuestion } from "@/features/trips/chat-contract";
import { formatMoney } from "@/features/trips/format";
import { editRequest } from "./edit-fixtures";
import { input, previewId } from "./fixtures";

function trip() {
  const itinerary = generateMockItinerary(
    { ...input, budget: 600, travelers: 2 },
    previewId,
  );
  itinerary.days.forEach((day, index) => {
    day.activities.forEach(
      (a, i) =>
        (a.estimatedCost =
          index === 1 ? [100, 150, 200][i] : index === 0 ? 10 : 5),
    );
    day.additionalCosts =
      index === 1
        ? { accommodation: 50, localTransport: 15, additionalMeals: 10 }
        : { accommodation: 0, localTransport: 0, additionalMeals: 0 };
  });
  return itinerary;
}
const query = (
  type: TravelQuestion["type"],
  dayNumber: number | null = null,
): TravelQuestion => ({ type, dayNumber, amount: null, currency: null });
it.each([
  ["day_cost", 2, "$525.00"],
  ["trip_cost", null, "$570.00"],
  ["per_person_cost", 2, "$262.50"],
  ["per_person_cost", null, "$285.00"],
  ["budget_remaining", null, "$30.00"],
  ["budget_status", null, "$30.00"],
  ["most_expensive_day", null, "Day 2"],
  ["cost_scope", 2, "all 2 travelers together"],
] as const)("answers %s deterministically", (type, day, text) => {
  const itinerary = trip(),
    before = structuredClone(itinerary);
  const answer = answerTravelQuestion(itinerary, query(type, day));
  expect(answer.message).toContain(text);
  expect(answer.evidence).toBe("itinerary_estimates");
  expect(itinerary).toEqual(before);
});
it("uses correct over-budget sign and does not describe negative remaining money as available", () => {
  const itinerary = trip();
  itinerary.input.budget = 500;
  const answer = answerTravelQuestion(itinerary, query("budget_remaining"));
  expect(answer.message).toContain("over the whole-party budget by $70.00");
  expect(answer.message).not.toContain("remaining");
});
it.each(["USD", "CAD", "EUR", "GBP", "JPY", "KRW"] as const)(
  "formats stored %s estimates consistently",
  (currency) => {
    const itinerary = trip();
    itinerary.input.currency = currency;
    expect(
      answerTravelQuestion(itinerary, query("day_cost", 2)).message,
    ).toContain(formatMoney(525, currency));
  },
);
it("preserves legacy one-traveler meaning and discloses incomplete samples", () => {
  const itinerary = trip();
  delete itinerary.input.travelers;
  delete itinerary.days[0].additionalCosts;
  const answer = answerTravelQuestion(itinerary, query("per_person_cost", 1));
  expect(answer.message).toContain("one traveler");
  expect(answer.message).toContain("$30.00 per person");
  expect(answer.message).toContain("may omit");
});
it("rejects missing/invalid activity costs rather than displaying NaN or inventing zero", () => {
  const itinerary = trip();
  itinerary.days[0].activities[0].estimatedCost = NaN;
  expect(() => answerTravelQuestion(itinerary, query("trip_cost"))).toThrow(
    /valid cost/,
  );
});
it("never combines a validated figure with the old unvalidated-calculation disclaimer", async () => {
  const request = editRequest(createSession(trip()));
  const response = await normalizeConversation(
    {
      message: "Day 2 spending totals $999 for both travelers.",
      presentation: "response",
      boundary: null,
      proposal: null,
      calculation: query("day_cost", 2),
    },
    request,
    (raw) => normalizeEditResponse(raw, request, "ai"),
  );
  expect(response.message).toContain(
    "$525.00 in total for all 2 travelers together",
  );
  expect(response.message).not.toContain("$999");
  expect(response.message).not.toContain("not a validated");
});
it("keeps server current and proposed totals distinct without accepting the edit", async () => {
  const itinerary = trip(),
    request = editRequest(createSession(itinerary)),
    day = itinerary.days[1];
  const { id, ...activity } = day.activities[2];
  const response = await normalizeConversation(
    {
      message: "Dinner can be less expensive. Day 2 would cost $1.",
      presentation: "response",
      boundary: null,
      action: {
        type: "proposal",
        operations: [
          {
            type: "replace_activity",
            dayId: day.id,
            activityId: id,
            activity: {
              ...activity,
              name: "Budget dinner",
              estimatedCost: 100,
            },
          },
        ],
      },
      calculation: query("day_cost", 2),
    },
    request,
    (raw) => normalizeEditResponse(raw, request, "ai"),
  );
  expect(response.kind).toBe("proposal");
  expect(response.message).toContain("$525.00");
  expect(response.message).toContain("Proposed Day 2 estimate: $425.00");
  if (response.kind !== "proposal") throw Error("Expected draft");
  expect(summarizeDayCosts(response.proposal.candidate.days[1]).total).toBe(
    425,
  );
  expect(summarizeDayCosts(request.itinerary.days[1]).total).toBe(525);
  expect(response.message).toContain("Nothing changes until you accept");
});
