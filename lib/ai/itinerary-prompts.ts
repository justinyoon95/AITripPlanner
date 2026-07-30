import type { Trip } from "@prisma/client";

import { formatDateRange, getInclusiveTripDayCount } from "@/lib/utils/dates";
import { formatCents } from "@/lib/utils/money";
import { formatTravelStyle } from "@/lib/utils/travel-style";

export function buildItineraryPrompt(trip: Trip) {
  const dayCount = getInclusiveTripDayCount(trip.startDate, trip.endDate);

  return `
Create a practical travel itinerary for this trip.

Trip details:
- Destination: ${trip.destination}
- Dates: ${formatDateRange(trip.startDate, trip.endDate)}
- Number of days: ${dayCount}
- Budget: ${formatCents(trip.budgetCents, trip.currency)}
- Travel style: ${formatTravelStyle(trip.travelStyle)}
- Interests: ${trip.interests.join(", ")}

Rules:
- Return exactly ${dayCount} days.
- Each day must include exactly three activities: MORNING, AFTERNOON, and EVENING.
- Costs must be estimated in cents as non-negative integers.
- Keep recommendations realistic for the destination and trip style.
- Do not claim live availability, exact reservation guarantees, or exact prices.
- Use concise descriptions and recommendation reasons.
`.trim();
}
