import { ArrowLeft, CalendarDays, CircleDollarSign, Pencil } from "lucide-react";
import Link from "next/link";

import { UserMenu } from "@/components/auth/user-menu";
import { CostSummary } from "@/components/trips/cost-summary";
import { DeleteTripButton } from "@/components/trips/delete-trip-button";
import { ItineraryGeneratorPanel } from "@/components/trips/itinerary-generator-panel";
import { ItineraryVersionHistory } from "@/components/trips/itinerary-version-history";
import { ItineraryView } from "@/components/trips/itinerary-view";
import { requireUser } from "@/lib/auth/require-user";
import { mapSavedItineraryToGeneratedItinerary } from "@/lib/services/itinerary-mapper";
import { isItineraryStaleForTrip } from "@/lib/services/itinerary-service";
import { getTripForUser } from "@/lib/services/trip-service";
import { formatDateRange } from "@/lib/utils/dates";
import { formatCents } from "@/lib/utils/money";
import { formatTravelStyle } from "@/lib/utils/travel-style";

type TripDetailPageProps = {
  params: Promise<{
    tripId: string;
  }>;
};

export default async function TripDetailPage({ params }: TripDetailPageProps) {
  const [{ tripId }, user] = await Promise.all([params, requireUser()]);
  const trip = await getTripForUser(user.id, tripId);
  const latestItinerary = trip.itineraries[0];
  const savedItinerary = latestItinerary
    ? mapSavedItineraryToGeneratedItinerary(latestItinerary)
    : undefined;
  const isLatestItineraryStale = latestItinerary
    ? isItineraryStaleForTrip(trip.updatedAt, latestItinerary.createdAt)
    : false;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Dashboard
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">
            {trip.destination}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatTravelStyle(trip.travelStyle)}
          </p>
        </div>
        <UserMenu user={user} />
      </div>

      <section className="grid gap-4 border-b py-8 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
            Dates
          </div>
          <p className="mt-2 font-medium">
            {formatDateRange(trip.startDate, trip.endDate)}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleDollarSign className="size-4" aria-hidden="true" />
            Budget
          </div>
          <p className="mt-2 font-medium">
            {formatCents(trip.budgetCents, trip.currency)}
          </p>
        </div>
      </section>

      <section className="border-b py-8">
        <h2 className="text-lg font-semibold tracking-normal">Interests</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {trip.interests.map((interest) => (
            <span
              key={interest}
              className="rounded-lg bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
            >
              {interest}
            </span>
          ))}
        </div>
      </section>

      <section className="py-8">
        <div className="grid gap-8">
          {savedItinerary && latestItinerary ? (
            <>
              {isLatestItineraryStale ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Trip details changed after this itinerary was generated.
                  Generate a new preview to create an updated version.
                </div>
              ) : null}
              <CostSummary
                itinerary={savedItinerary}
                budgetCents={trip.budgetCents}
                currency={trip.currency}
              />
              <ItineraryView
                itinerary={savedItinerary}
                currency={trip.currency}
                heading={`Saved itinerary version ${latestItinerary.version}`}
              />
              <ItineraryVersionHistory versions={trip.itineraries} />
            </>
          ) : null}

          <ItineraryGeneratorPanel
            tripId={trip.id}
            currency={trip.currency}
            hasSavedItinerary={Boolean(savedItinerary)}
          />
        </div>
      </section>

      <div className="mt-auto flex justify-end gap-3 border-t pt-6">
        <Link
          href={`/trips/${trip.id}/edit`}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Pencil className="size-4" aria-hidden="true" />
          Edit
        </Link>
        <DeleteTripButton tripId={trip.id} />
      </div>
    </main>
  );
}
