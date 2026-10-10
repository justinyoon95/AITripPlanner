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
} from "lucide-react";
import Link from "next/link";
import type { Itinerary, Interest } from "@/features/trips/types";
import { summarizeCosts, summarizeDayCosts } from "@/features/trips/costs";
import { formatDate, formatMoney } from "@/features/trips/format";
import { buttonVariants } from "@/components/ui/button";

const categoryIcons = {
  Food: Utensils,
  Nature: Leaf,
  Culture: Landmark,
  Shopping: ShoppingBag,
  Nightlife: Moon,
  Relaxation: Coffee,
} satisfies Record<Interest, typeof Leaf>;

export function ItineraryView({ itinerary }: { itinerary: Itinerary }) {
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
              </header>
              <div className="activity-list">
                {day.activities.map((activity) => {
                  const Icon = categoryIcons[activity.category];
                  return (
                    <article className="activity" key={activity.id}>
                      <div className="activity-time">
                        <span>{activity.time}</span>
                        <div className="timeline-dot" />
                      </div>
                      <div className="activity-content">
                        <div className="activity-category">
                          <Icon size={14} />
                          {activity.category}
                        </div>
                        <h3>{activity.name}</h3>
                        <p>{activity.description}</p>
                        <div className="activity-details">
                          <span>
                            <Clock3 size={14} />
                            {activity.durationMinutes >= 60
                              ? `${activity.durationMinutes / 60} hr`
                              : `${activity.durationMinutes} min`}
                          </span>
                          <span>
                            {formatMoney(
                              activity.estimatedCost,
                              input.currency,
                            )}{" "}
                            estimated
                          </span>
                        </div>
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
                ? "Estimates for one traveler include activities, accommodation, local transport, and additional meals. Travel to and from the destination is excluded. These are not verified prices."
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
