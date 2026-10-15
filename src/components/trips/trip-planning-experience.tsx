"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TripForm } from "./trip-form";
import { DestinationPhoto } from "./destination-photo";
import { DestinationMap } from "./destination-map";

export function TripPlanningExperience({
  destination,
  mockMode,
}: {
  destination: string;
  mockMode: boolean;
}) {
  return (
    <TripForm
      destination={destination}
      mockMode={mockMode}
      formClassName="trip-form shell planner-form"
      renderHeader={(city) => (
        <section className="planner-hero" aria-labelledby="planner-title">
          <DestinationPhoto destination={city} variant="hero" />
          <div className="planner-hero-shade" aria-hidden="true" />
          <div className="shell planner-hero-content">
            <Link href="/" className="back-link">
              <ArrowLeft size={16} />
              Back to exploring
            </Link>
            <div className="planner-hero-heading">
              <span className="eyebrow">LET&apos;S GO SOMEWHERE</span>
              <h1 id="planner-title">Make room for adventure.</h1>
              <p>A few details now. A world of possibilities next.</p>
            </div>
          </div>
        </section>
      )}
      renderDestination={(city) => (
        <div className="planner-destination-preview">
          <DestinationMap destination={city} heading="Destination preview" />
        </div>
      )}
    />
  );
}
