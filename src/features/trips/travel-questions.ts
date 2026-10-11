import type { Itinerary } from "./types";
import { questionSchema, type TravelQuestion } from "./chat-contract";
import { roundMoney, summarizeCosts, summarizeDayCosts } from "./costs";
import { formatMoney } from "./format";
import { EditError } from "./edit-schema";

export function answerTravelQuestion(trip: Itinerary, raw: TravelQuestion) {
  const query = questionSchema.parse(raw);
  const day =
    query.dayNumber === null
      ? null
      : trip.days.find((d) => d.number === query.dayNumber);
  if (query.dayNumber !== null && !day)
    throw new EditError(
      "UNKNOWN_TARGET",
      "That day is not in your current trip. Which day did you mean?",
    );
  if (query.currency && query.currency !== trip.input.currency)
    throw new EditError(
      "CURRENCY_MISMATCH",
      `Your itinerary uses ${trip.input.currency}. I cannot convert currencies without an exchange rate. Please ask using that currency.`,
    );
  if (query.type !== "budget_delta" && query.amount !== null)
    throw new EditError(
      "INVALID_QUESTION",
      "Only a hypothetical budget question can include an extra amount.",
    );
  const money = (n: number) => formatMoney(n, trip.input.currency);
  const total = summarizeCosts(trip).total;
  let message: string;
  if (query.type === "budget_delta") {
    if (query.amount === null || query.currency === null)
      throw new EditError(
        "CLARIFY_AMOUNT",
        `Specify an additional amount in ${trip.input.currency}. This will be a hypothetical calculation, not an edit.`,
      );
    const updated = roundMoney(total + query.amount);
    const remaining = roundMoney(trip.input.budget - updated);
    message = `Adding ${money(query.amount)}${day ? ` on Day ${day.number}` : ""} would bring your estimated trip total to ${money(updated)}. ${remaining < 0 ? `That exceeds your ${money(trip.input.budget)} budget by ${money(-remaining)}.` : `That leaves ${money(remaining)} within your ${money(trip.input.budget)} budget.`} Your itinerary is unchanged.`;
  } else if (query.type === "food_cost") {
    const days = day ? [day] : trip.days;
    const known = roundMoney(
      days.reduce(
        (sum, d) =>
          sum +
          d.activities
            .filter((a) => a.category === "Food")
            .reduce((s, a) => s + a.estimatedCost, 0) +
          (d.additionalCosts?.additionalMeals ?? 0),
        0,
      ),
    );
    message = `Recorded food-related estimates${day ? ` for Day ${day.number}` : " for this trip"} total ${money(known)}: Food-category activities plus additional meals. Mixed activities may include unitemized food, and older samples may omit meals; this is not a complete or verified food bill.`;
  } else if (query.type === "day_cost") {
    if (!day)
      throw new EditError(
        "CLARIFY_DAY",
        "Which day would you like a spending estimate for?",
      );
    message = `Day ${day.number}'s estimated cost is ${money(summarizeDayCosts(day).total)}. Trip total: ${money(total)}; budget: ${money(trip.input.budget)}. These are destination estimates, not verified prices.`;
  } else if (query.type === "trip_cost") {
    message = `Your estimated destination total is ${money(total)}, against a ${money(trip.input.budget)} budget. ${total > trip.input.budget ? `Estimated overrun: ${money(roundMoney(total - trip.input.budget))}.` : `Estimated remaining budget: ${money(roundMoney(trip.input.budget - total))}.`} Travel to/from the destination is excluded; prices are not verified.`;
  } else if (query.type === "preferences") {
    message = `Your recorded pace is ${trip.input.pace}, with interests in ${trip.input.interests.join(", ")}. Additional preferences: ${trip.input.preferences || "none recorded"}. These are your supplied preferences, not verified suitability assurances.`;
  } else {
    if (!day)
      throw new EditError(
        "CLARIFY_DAY",
        "Which day's suggested schedule would you like to see?",
      );
    message = `Day ${day.number}: ${day.activities.map((a) => `${a.time} ${a.name} (${a.durationMinutes} min)`).join("; ")}. These are planned times, not confirmed opening hours or route times.`;
  }
  return {
    message: message.slice(0, 1000),
    evidence:
      query.type === "preferences" || query.type === "schedule"
        ? ("itinerary_data" as const)
        : ("itinerary_estimates" as const),
  };
}
