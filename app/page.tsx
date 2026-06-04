import { ArrowRight, MapPinned } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-16">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground">
            <MapPinned className="size-4" aria-hidden="true" />
            Portfolio-grade full-stack trip planning
          </div>
          <h1 className="text-4xl font-semibold tracking-normal text-foreground sm:text-6xl">
            AI Trip Planner
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            Generate structured travel itineraries, preview the plan, and save
            only the trips worth keeping.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="/trips/new"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Plan a trip
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
            <a
              href="/dashboard"
              className="inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              View dashboard
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
