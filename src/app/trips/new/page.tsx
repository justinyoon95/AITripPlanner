import { TripPlanningExperience } from "@/components/trips/trip-planning-experience";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Plan your trip" };
export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<{ destination?: string | string[] }>;
}) {
  const params = await searchParams;
  const destination =
    typeof params.destination === "string"
      ? params.destination.slice(0, 100)
      : "";
  return (
    <main id="main" className="planner-page">
      <TripPlanningExperience
        destination={destination}
        mockMode={
          process.env.TRIP_GENERATION_MODE === "mock" &&
          process.env.NODE_ENV !== "production"
        }
      />
    </main>
  );
}
