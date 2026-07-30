import type { GeneratedItinerary } from "@/lib/ai/itinerary-schema";
import { formatCents } from "@/lib/utils/money";
import { ItineraryDayCard } from "@/components/trips/itinerary-day-card";

type ItineraryViewProps = {
  itinerary: GeneratedItinerary;
  currency: string;
  heading?: string;
};

export function ItineraryView({
  itinerary,
  currency,
  heading = "Itinerary",
}: ItineraryViewProps) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal">{heading}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Estimated total:{" "}
            {formatCents(itinerary.totalEstimatedCostCents, currency)}
          </p>
        </div>
      </div>

      {itinerary.days.map((day) => (
        <ItineraryDayCard key={day.dayNumber} day={day} currency={currency} />
      ))}
    </div>
  );
}
