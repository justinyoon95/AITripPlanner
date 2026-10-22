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
  if (
    !Number.isFinite(total) ||
    trip.days.some((d) => !Number.isFinite(summarizeDayCosts(d).total))
  )
    throw new EditError(
      "COST_UNAVAILABLE",
      "The current itinerary does not contain valid cost estimates for this calculation.",
    );
  const travelers = trip.input.travelers ?? 1;
  const party =
    travelers === 1 ? "one traveler" : `all ${travelers} travelers together`;
  const partial = trip.days.some((d) => !d.additionalCosts)
    ? " Older samples may omit accommodation, transport or meal costs; these are recorded estimates, not a complete bill."
    : "";
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
    message = `Day ${day.number}'s estimated cost is ${money(summarizeDayCosts(day).total)} in total for ${party}. Trip total: ${money(total)}; budget: ${money(trip.input.budget)}. These are destination estimates, not verified prices.`;
  } else if (query.type === "trip_cost") {
    message = `Your estimated destination total is ${money(total)} for ${party}, against a ${money(trip.input.budget)} budget. ${total > trip.input.budget ? `Estimated overrun: ${money(roundMoney(total - trip.input.budget))}.` : `Estimated remaining budget: ${money(roundMoney(trip.input.budget - total))}.`} Travel to/from the destination is excluded; prices are not verified.`;
  } else if (query.type === "per_person_cost") {
    const cost = day ? summarizeDayCosts(day).total : total;
    message = `${day ? `Day ${day.number}` : "This trip"} is estimated at ${money(cost)} for ${party}, or ${money(roundMoney(cost / travelers))} per person if shared equally. This allocation is an estimate, not an itemized individual bill.`;
  } else if (
    query.type === "budget_remaining" ||
    query.type === "budget_status"
  ) {
    const remaining = roundMoney(trip.input.budget - total);
    message = `${remaining < 0 ? `You are over the whole-party budget by ${money(-remaining)}` : `You have ${money(remaining)} remaining in your whole-party budget`}. Estimated spending: ${money(total)} for ${party}; budget: ${money(trip.input.budget)}. Prices are not verified.`;
  } else if (query.type === "most_expensive_day") {
    const maximum = Math.max(
      ...trip.days.map((d) => summarizeDayCosts(d).total),
    );
    const days = trip.days
      .filter((d) => summarizeDayCosts(d).total === maximum)
      .map((d) => `Day ${d.number}`)
      .join(", ");
    message = `${days}${days.includes(",") ? " tie for the highest daily estimate" : " has the highest daily estimate"}: ${money(maximum)} for ${party}. Prices are not verified.`;
  } else if (query.type === "cost_scope") {
    message = `Recorded costs${day ? ` for Day ${day.number}` : " for this trip"} cover ${party}, not an additional charge for each person. The estimate is ${money(day ? summarizeDayCosts(day).total : total)}.`;
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
    message: (
      message +
      (!["preferences", "schedule"].includes(query.type) ? partial : "")
    ).slice(0, 1000),
    evidence:
      query.type === "preferences" || query.type === "schedule"
        ? ("itinerary_data" as const)
        : ("itinerary_estimates" as const),
  };
}
