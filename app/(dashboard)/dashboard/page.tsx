import { Plus } from "lucide-react";
import Link from "next/link";

import { UserMenu } from "@/components/auth/user-menu";
import { TripCard } from "@/components/trips/trip-card";
import { requireUser } from "@/lib/auth/require-user";
import { getTripsForUser } from "@/lib/services/trip-service";

export default async function DashboardPage() {
  const user = await requireUser();
  const trips = await getTripsForUser(user.id);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">
            Saved trips
          </h1>
        </div>
        <UserMenu user={user} />
      </div>

      <section className="py-10">
        {trips.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
            <h2 className="text-xl font-semibold tracking-normal">
              No saved trips yet
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Create your first trip to start building the itinerary workflow.
            </p>
            <Link
              href="/trips/new"
              className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="size-4" aria-hidden="true" />
              New trip
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
