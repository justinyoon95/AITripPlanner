import { CalendarDays, CircleDollarSign, MapPin } from "lucide-react";
import Link from "next/link";

import { formatDateRange } from "@/lib/utils/dates";
import { formatCents } from "@/lib/utils/money";
import { formatTravelStyle } from "@/lib/utils/travel-style";

type TripCardProps = {
  trip: {
    id: string;
    destination: string;
    startDate: Date;
    endDate: Date;
    budgetCents: number;
    currency: string;
    interests: string[];
    travelStyle: Parameters<typeof formatTravelStyle>[0];
    _count: {
      itineraries: number;
    };
  };
};

export function TripCard({ trip }: TripCardProps) {
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="grid gap-4 rounded-lg border bg-card p-5 text-card-foreground transition-colors hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden="true" />
            {formatTravelStyle(trip.travelStyle)}
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-normal">
            {trip.destination}
          </h2>
        </div>
        <span className="rounded-lg border px-2.5 py-1 text-xs text-muted-foreground">
          {trip._count.itineraries} itinerary
        </span>
      </div>

      <div className="grid gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4" aria-hidden="true" />
          {formatDateRange(trip.startDate, trip.endDate)}
        </div>
        <div className="flex items-center gap-2">
          <CircleDollarSign className="size-4" aria-hidden="true" />
          {formatCents(trip.budgetCents, trip.currency)}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {trip.interests.map((interest) => (
          <span
            key={interest}
            className="rounded-lg bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
          >
            {interest}
          </span>
        ))}
      </div>
    </Link>
  );
}
