import Link from "next/link";

import { cn } from "@/lib/utils";

type ItineraryVersionHistoryProps = {
  tripId: string;
  selectedVersion: number;
  versions: Array<{
    id: string;
    version: number;
    model: string;
    createdAt: Date;
    totalEstimatedCostCents: number | null;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function ItineraryVersionHistory({
  tripId,
  selectedVersion,
  versions,
}: ItineraryVersionHistoryProps) {
  if (versions.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border p-5">
      <h2 className="text-lg font-semibold tracking-normal">Version history</h2>
      <div className="mt-4 grid gap-3">
        {versions.map((version, index) => (
          <Link
            key={version.id}
            href={`/trips/${tripId}?version=${version.version}`}
            className={cn(
              "flex flex-col gap-1 rounded-lg border px-3 py-2 transition-colors sm:flex-row sm:items-center sm:justify-between",
              version.version === selectedVersion
                ? "border-primary bg-muted"
                : "border-transparent bg-muted/40 hover:border-border hover:bg-muted",
            )}
            aria-current={
              version.version === selectedVersion ? "page" : undefined
            }
          >
            <div>
              <p className="text-sm font-medium">
                Version {version.version}
                {index === 0 ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    Latest
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {dateFormatter.format(version.createdAt)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">{version.model}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
