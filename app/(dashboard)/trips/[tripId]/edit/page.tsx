import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { UserMenu } from "@/components/auth/user-menu";
import { TripForm } from "@/components/trips/trip-form";
import { updateTripAction } from "@/lib/actions/trip-actions";
import { requireUser } from "@/lib/auth/require-user";
import { getTripForUser } from "@/lib/services/trip-service";
import { formatDateInputValue } from "@/lib/utils/dates";
import { centsToDollars } from "@/lib/utils/money";

type EditTripPageProps = {
  params: Promise<{
    tripId: string;
  }>;
};

export default async function EditTripPage({ params }: EditTripPageProps) {
  const [{ tripId }, user] = await Promise.all([params, requireUser()]);
  const trip = await getTripForUser(user.id, tripId);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-10">
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href={`/trips/${trip.id}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Trip details
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">
            Edit trip
          </h1>
        </div>
        <UserMenu user={user} />
      </div>

      <section className="py-10">
        <TripForm
          defaultValues={{
            destination: trip.destination,
            startDate: formatDateInputValue(trip.startDate),
            endDate: formatDateInputValue(trip.endDate),
            budget: centsToDollars(trip.budgetCents),
            interestsText: trip.interests.join(", "),
            travelStyle: trip.travelStyle,
          }}
          submitLabel="Update trip"
          pendingLabel="Updating"
          onSubmitTrip={async (input) => {
            "use server";

            return updateTripAction(trip.id, input);
          }}
        />
      </section>
    </main>
  );
}
