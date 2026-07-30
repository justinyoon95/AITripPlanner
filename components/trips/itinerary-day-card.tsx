import type { GeneratedItinerary } from "@/lib/ai/itinerary-schema";
import { formatCents } from "@/lib/utils/money";

type ItineraryDayCardProps = {
  day: GeneratedItinerary["days"][number];
  currency: string;
};

const timeBlockLabels = {
  MORNING: "Morning",
  AFTERNOON: "Afternoon",
  EVENING: "Evening",
};

export function ItineraryDayCard({ day, currency }: ItineraryDayCardProps) {
  return (
    <article className="rounded-lg border bg-card p-5 text-card-foreground">
      <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Day {day.dayNumber}
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-normal">
            {day.summary}
          </h3>
        </div>
        <span className="text-sm font-medium">
          {formatCents(day.estimatedCostCents, currency)}
        </span>
      </div>

      <div className="mt-4 grid gap-4">
        {day.activities.map((activity) => (
          <div
            key={`${day.dayNumber}-${activity.timeBlock}-${activity.sortOrder}`}
            className="grid gap-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                {timeBlockLabels[activity.timeBlock]}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatCents(activity.estimatedCostCents, currency)}
              </span>
            </div>
            <h4 className="font-medium">{activity.name}</h4>
            <p className="text-sm leading-6 text-muted-foreground">
              {activity.description}
            </p>
            <p className="text-sm leading-6">
              <span className="font-medium">Why: </span>
              {activity.reason}
            </p>
            {activity.locationHint ? (
              <p className="text-xs text-muted-foreground">
                Location hint: {activity.locationHint}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </article>
  );
}
