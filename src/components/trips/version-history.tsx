import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TripSession } from "@/features/trips/session-schema";

export function VersionHistory({
  session,
  busy,
  onRestore,
}: {
  session: TripSession;
  busy: boolean;
  onRestore: (id: string) => void;
}) {
  return (
    <section className="version-history" aria-label="Version history">
      <h3>Version history</h3>
      <ol>
        {session.versions.map((version, index) => (
          <li
            key={version.id}
            aria-current={
              version.id === session.activeVersionId ? "true" : undefined
            }
          >
            <div className="version-label">
              <strong>Version {index + 1}</strong>
              {version.id === session.activeVersionId && (
                <span>
                  <Check size={13} />
                  Active
                </span>
              )}
            </div>
            <p>{version.summary}</p>
            {version.parentVersionId && (
              <small>
                Based on version{" "}
                {session.versions.findIndex(
                  (item) => item.id === version.parentVersionId,
                ) + 1}
              </small>
            )}
            <time dateTime={version.createdAt}>
              {new Date(version.createdAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
            {version.id !== session.activeVersionId && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => onRestore(version.id)}
              >
                <RotateCcw size={14} />
                Restore version {index + 1}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
