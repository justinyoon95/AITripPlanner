import { UserMenu } from "@/components/auth/user-menu";
import { TripForm } from "@/components/trips/trip-form";
import { requireUser } from "@/lib/auth/require-user";

export default async function NewTripPage() {
  const user = await requireUser();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-10">
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">New trip</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">
            Plan a trip
          </h1>
        </div>
        <UserMenu user={user} />
      </div>
      <section className="py-10">
        <TripForm />
      </section>
    </main>
  );
}
