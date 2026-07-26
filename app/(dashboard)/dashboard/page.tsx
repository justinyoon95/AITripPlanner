import { UserMenu } from "@/components/auth/user-menu";
import { requireUser } from "@/lib/auth/require-user";

export default async function DashboardPage() {
  const user = await requireUser();

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
      <section className="flex flex-1 items-center py-16 text-muted-foreground">
        Saved trips will appear here after trip persistence is added.
      </section>
    </main>
  );
}
