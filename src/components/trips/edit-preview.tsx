import { Check, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { itineraryDiff } from "@/features/trips/edit-diff";
import { formatMoney } from "@/features/trips/format";
import type { EditProposal } from "@/features/trips/edit-schema";
import type { Activity, Itinerary } from "@/features/trips/types";

function ActivityDetails({
  activity,
  currency,
}: {
  activity: Activity | null;
  currency: Itinerary["input"]["currency"];
}) {
  if (!activity) return <p className="change-empty">No activity</p>;
  return (
    <>
      <strong>{activity.name}</strong>
      <p>{activity.description}</p>
      <small>
        {activity.category} · {activity.time} · {activity.durationMinutes} min ·{" "}
        {formatMoney(activity.estimatedCost, currency)} estimated
      </small>
    </>
  );
}
export function EditPreview({
  base,
  proposal,
  busy,
  onAccept,
  onReject,
}: {
  base: Itinerary;
  proposal: EditProposal;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const diff = itineraryDiff(base, proposal.candidate);
  return (
    <section className="edit-preview" aria-label="Proposed changes">
      <header>
        <h3>Proposed changes</h3>
        <span>
          {proposal.source === "mock" ? "Sample proposal" : "AI proposal"}
        </span>
      </header>
      <p>{proposal.summary}</p>
      <div className="change-list">
        {diff.activities.map((change, index) => (
          <article className="activity-change" key={index}>
            <h4>
              Day {change.dayNumber} ·{" "}
              {change.before
                ? change.after
                  ? "Replace / update"
                  : "Remove"
                : "Add"}
            </h4>
            <div className="change-before">
              <span>Before</span>
              <ActivityDetails
                activity={change.before}
                currency={base.input.currency}
              />
            </div>
            <div className="change-after">
              <span>After</span>
              <ActivityDetails
                activity={change.after}
                currency={base.input.currency}
              />
            </div>
          </article>
        ))}
        {diff.dailyCosts.map((change) => (
          <article className="activity-change" key={`cost-${change.dayNumber}`}>
            <h4>Day {change.dayNumber} · Daily estimates</h4>
            {(
              ["accommodation", "localTransport", "additionalMeals"] as const
            ).map((key) => (
              <p key={key}>
                {key === "localTransport"
                  ? "Local transport"
                  : key === "additionalMeals"
                    ? "Additional meals"
                    : "Accommodation"}
                :{" "}
                {formatMoney(
                  change.beforeExtras?.[key] ?? 0,
                  base.input.currency,
                )}{" "}
                <ArrowRight size={12} />{" "}
                {formatMoney(
                  change.afterExtras?.[key] ?? 0,
                  base.input.currency,
                )}
              </p>
            ))}
          </article>
        ))}
      </div>
      <div className="proposal-cost">
        <span>Estimated trip total</span>
        <strong>
          {formatMoney(diff.beforeTotal, base.input.currency)}{" "}
          <ArrowRight size={14} />{" "}
          {formatMoney(diff.afterTotal, base.input.currency)}
        </strong>
        <small>
          {diff.delta < 0 ? "Estimated savings" : "Estimated increase"}:{" "}
          {formatMoney(Math.abs(diff.delta), base.input.currency)}
        </small>
      </div>
      <div className="proposal-actions">
        <Button disabled={busy} onClick={onAccept}>
          <Check size={16} />
          Accept changes
        </Button>
        <Button variant="outline" disabled={busy} onClick={onReject}>
          <X size={16} />
          Reject
        </Button>
      </div>
    </section>
  );
}
