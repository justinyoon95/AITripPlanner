export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <div className="border-b pb-6">
        <p className="text-sm font-medium text-muted-foreground">Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">
          Saved trips
        </h1>
      </div>
      <section className="flex flex-1 items-center py-16 text-muted-foreground">
        Saved trips will appear here after authentication and persistence are
        added.
      </section>
    </main>
  );
}
