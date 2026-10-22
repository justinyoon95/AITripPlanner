import {
  Clock3,
  MapPin,
  CalendarDays,
  Wallet,
  ArrowUpRight,
  Leaf,
  Utensils,
  Landmark,
  ShoppingBag,
  Moon,
  Coffee,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import type { Itinerary, Interest } from "@/features/trips/types";
import { summarizeCosts, summarizeDayCosts } from "@/features/trips/costs";
import { formatDate, formatMoney } from "@/features/trips/format";
import { buttonVariants } from "@/components/ui/button";
import type { ReactNode } from "react";
import { travelWindow, windowLabel } from "@/features/trips/travel-planning";
import {
  durationConcern,
  verifiedLocation,
} from "@/features/trips/activity-locations";

const categoryIcons = {
  Food: Utensils,
  Nature: Leaf,
  Culture: Landmark,
  Shopping: ShoppingBag,
  Nightlife: Moon,
  Relaxation: Coffee,
} satisfies Record<Interest, typeof Leaf>;

export function ItineraryView({
  itinerary,
  editor,
  onEditActivity,
  editDisabled = false,
  map,
  selectedActivityId,
  onLocateActivity,
}: {
  itinerary: Itinerary;
  editor?: ReactNode;
  onEditActivity?: (dayId: string, activityId: string | null) => void;
  editDisabled?: boolean;
  map?: ReactNode;
  selectedActivityId?: string | null;
  onLocateActivity?: (dayId: string, activityId: string) => void;
}) {
  const { input, days } = itinerary;
  const cost = summarizeCosts(itinerary);
  return (
    <>
      <div className="itinerary-heading">
        <div>
          <span className="eyebrow">YOUR TRIP, TAKING SHAPE</span>
          <h1>{input.destination}</h1>
          <div className="trip-meta">
            <span>
              <CalendarDays size={17} />
              {formatDate(input.startDate)} - {formatDate(input.endDate)}
            </span>
            <span>
              {days.length} {days.length === 1 ? "day" : "days"}
            </span>
            <span className="capitalize">{input.pace} pace</span>
            {input.travelers && (
              <span>
                {input.travelers}{" "}
                {input.travelers === 1 ? "traveler" : "travelers"}; whole-party
                estimates
              </span>
            )}
          </div>
        </div>
        <Link
          href={`/trips/new?destination=${encodeURIComponent(input.destination)}`}
          className={buttonVariants({ variant: "outline" })}
        >
          Create another plan <ArrowUpRight size={17} />
        </Link>
      </div>
      <div className="preview-notice">
        <span className="sample-dot" />
        {itinerary.source === "ai"
          ? "AI-generated itinerary"
          : "Sample itinerary"}{" "}
        <span>
          Suggested activities and estimated costs. Verify places, prices, and
          availability before traveling.
        </span>
      </div>
      {itinerary.overview && (
        <p className="trip-overview">{itinerary.overview}</p>
      )}
      {itinerary.warnings.length > 0 && (
        <div className="error-box" aria-label="Travel considerations">
          <h2>Before you go</h2>
          <ul>
            {itinerary.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {map}
      <div className="itinerary-grid">
        <div className="day-list">
          {days.map((day) => (
            <section
              key={day.id}
              id={`day-${day.number}`}
              className="day-section"
            >
              <header className="day-heading">
                <span className="day-number">
                  {String(day.number).padStart(2, "0")}
                </span>
                <div>
                  <span className="day-date">
                    DAY {day.number} ·{" "}
                    {formatDate(day.date, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <h2>{day.title}</h2>
                </div>
                {onEditActivity && (
                  <button
                    type="button"
                    className="icon-button day-edit"
                    title={`Edit Day ${day.number}`}
                    aria-label={`Edit Day ${day.number}`}
                    disabled={editDisabled}
                    onClick={() => onEditActivity(day.id, null)}
                  >
                    <MessageSquare size={17} />
                  </button>
                )}
              </header>
              {travelWindow(input, day.date).notes.length > 0 && (
                <div className="travel-logistics">
                  <h3>Travel logistics</h3>
                  <p>{windowLabel(travelWindow(input, day.date))}</p>
                  <ul>
                    {travelWindow(input, day.date).notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="activity-list">
                {day.activities.map((activity) => {
                  const Icon = categoryIcons[activity.category];
                  return (
                    <article
                      className="activity"
                      key={activity.id}
                      id={`activity-${activity.id}`}
                      data-map-selected={
                        selectedActivityId === activity.id ? "true" : undefined
                      }
                    >
                      <div className="activity-time">
                        <span>{activity.time}</span>
                        <div className="timeline-dot" />
                      </div>
                      <div className="activity-content">
                        <div className="activity-category">
                          <Icon size={14} />
                          {activity.category}
                        </div>
                        <div className="activity-title">
                          <h3>{activity.name}</h3>
                          {onLocateActivity && (
                            <button
                              type="button"
                              className="icon-button"
                              title={
                                verifiedLocation(activity, input)
                                  ? "Show on map"
                                  : "Location unresolved"
                              }
                              aria-label={`Locate ${activity.name} on Day ${day.number}`}
                              disabled={!verifiedLocation(activity, input)}
                              onClick={() =>
                                onLocateActivity(day.id, activity.id)
                              }
                            >
                              <MapPin size={17} />
                            </button>
                          )}
                          {onEditActivity && (
                            <button
                              type="button"
                              className="icon-button"
                              title="Edit this activity"
                              aria-label={`Edit ${activity.name} on Day ${day.number}`}
                              disabled={editDisabled}
                              onClick={() =>
                                onEditActivity(day.id, activity.id)
                              }
                            >
                              <MessageSquare size={15} />
                            </button>
                          )}
                        </div>
                        <p>{activity.description}</p>
                        <div className="activity-details">
                          <span>
                            <Clock3 size={14} />
                            {activity.durationMinutes >= 60
                              ? `${activity.durationMinutes / 60} hr`
                              : `${activity.durationMinutes} min`}
                            {activity.durationSource === "user_provided"
                              ? " · user-provided"
                              : activity.durationSource === "ai_estimate"
                                ? " · AI estimate"
                                : " · source unknown"}
                          </span>
                          <span>
                            {formatMoney(
                              activity.estimatedCost,
                              input.currency,
                            )}{" "}
                            estimated
                          </span>
                        </div>
                        {durationConcern(activity, input) && (
                          <p className="field-error">
                            {durationConcern(activity, input)}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              {day.additionalCosts && (
                <dl className="day-extras">
                  <div>
                    <dt>Accommodation</dt>
                    <dd>
                      {formatMoney(
                        day.additionalCosts.accommodation,
                        input.currency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Local transport</dt>
                    <dd>
                      {formatMoney(
                        day.additionalCosts.localTransport,
                        input.currency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Additional meals</dt>
                    <dd>
                      {formatMoney(
                        day.additionalCosts.additionalMeals,
                        input.currency,
                      )}
                    </dd>
                  </div>
                </dl>
              )}
              <div className="day-cost">
                Day {day.number}{" "}
                {itinerary.source === "ai" ? "total" : "activity"} estimate{" "}
                <strong>
                  {formatMoney(summarizeDayCosts(day).total, input.currency)}
                </strong>
              </div>
            </section>
          ))}
        </div>
        <aside className="trip-sidebar">
          {editor}
          <div className="budget-panel">
            <div className="panel-heading">
              <Wallet size={19} />
              <h2>Your budget at a glance</h2>
            </div>
            <div className="budget-total">
              <span>
                {itinerary.source === "ai"
                  ? "Estimated destination costs"
                  : "Estimated activities"}
              </span>
              <strong>{formatMoney(cost.total, input.currency)}</strong>
              <small>
                of {formatMoney(input.budget, input.currency)} total budget
              </small>
            </div>
            <div
              className="budget-track"
              role="progressbar"
              aria-label="Estimated budget utilization"
              aria-valuenow={Math.min(100, Math.round(cost.percent))}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${Math.min(cost.percent, 100)}%` }} />
            </div>
            <div className="remaining">
              <span>
                {cost.remaining < 0 ? "Over budget" : "Unallocated budget"}
              </span>
              <strong>
                {formatMoney(Math.abs(cost.remaining), input.currency)}
              </strong>
            </div>
            <p className="budget-disclaimer">
              {itinerary.source === "ai"
                ? `Estimates for ${input.travelers ?? 1} traveler${(input.travelers ?? 1) === 1 ? "" : "s"} cover the whole party, including activities, accommodation, local transport, and additional meals. Travel to and from the destination is excluded. Prices are not verified.`
                : "Flights, accommodation, and transport are not included. Sample costs are illustrative, not local price estimates."}
            </p>
            {itinerary.budgetAssessment && (
              <p className="budget-disclaimer">
                {itinerary.budgetAssessment.explanation}
              </p>
            )}
          </div>
          <nav className="day-nav" aria-label="Itinerary days">
            <h2>Jump to a day</h2>
            {days.map((day) => (
              <a href={`#day-${day.number}`} key={day.id}>
                <span>Day {day.number}</span>
                <span>
                  {formatDate(day.date, { month: "short", day: "numeric" })}
                </span>
                <ArrowUpRight size={14} />
              </a>
            ))}
          </nav>
          <div className="preferences-summary">
            <h2>
              <MapPin size={17} />
              Your travel style
            </h2>
            <div className="tag-list">
              {input.interests.map((interest) => (
                <span key={interest}>{interest}</span>
              ))}
            </div>
            {input.preferences && (
              <>
                <h3>Your notes</h3>
                <p>{input.preferences}</p>
              </>
            )}
            {input.seasonalPreference && (
              <p>
                Seasonal experiences:{" "}
                {input.seasonalPreference === "exclude"
                  ? "not specifically included"
                  : input.seasonalPreference === "prioritize"
                    ? "prioritized"
                    : "included when relevant"}
              </p>
            )}
            {input.travel?.accommodation && (
              <>
                <h3>Accommodation</h3>
                <p>
                  {[
                    input.travel.accommodation.name,
                    input.travel.accommodation.location,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Not specified"}
                </p>
              </>
            )}
            {itinerary.assumptions.length > 0 && (
              <>
                <h3>Planning assumptions</h3>
                <ul>
                  {itinerary.assumptions.map((assumption, index) => (
                    <li key={index}>{assumption}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
