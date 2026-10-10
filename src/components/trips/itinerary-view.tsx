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
import { summarizeCosts } from "@/features/trips/mock-generator";
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
        Sample itinerary{" "}
        <span>
          Illustrative activities and costs. Verify places, prices, and
          availability before traveling.
        </span>
      </div>
      <div className="itinerary-grid">
        <div className="day-list">
          {days.map((day) => (
            <section
              key={day.number}
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
              <div className="day-cost">
                Day {day.number} activity estimate{" "}
                <strong>
                  {formatMoney(
                    day.activities.reduce(
                      (sum, activity) => sum + activity.estimatedCost,
                      0,
                    ),
                    input.currency,
                  )}
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
              <span>Estimated activities</span>
              <strong>{formatMoney(cost.total, input.currency)}</strong>
              <small>
                of {formatMoney(input.budget, input.currency)} total budget
              </small>
            </div>
            <div
              className="budget-track"
              role="progressbar"
              aria-label="Budget used by sample activities"
              aria-valuenow={Math.round(cost.percent)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${Math.min(cost.percent, 100)}%` }} />
            </div>
            <div className="remaining">
              <span>Unallocated budget</span>
              <strong>{formatMoney(cost.remaining, input.currency)}</strong>
            </div>
            <p className="budget-disclaimer">
              Flights, accommodation, and transport are not included. These
              sample costs are illustrative, not local price estimates.
            </p>
          </div>
          <nav className="day-nav" aria-label="Itinerary days">
            <h2>Jump to a day</h2>
            {days.map((day) => (
              <a href={`#day-${day.number}`} key={day.number}>
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
          </div>
        </aside>
      </div>
    </>
  );
}
