import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Compass, ShieldCheck } from "lucide-react";
import { TripForm } from "@/components/trips/trip-form";
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
    <main id="main" className="shell planner-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} />
        Back to exploring
      </Link>
      <div className="planner-heading">
        <span className="eyebrow">LET&apos;S GO SOMEWHERE</span>
        <h1>Make room for adventure.</h1>
        <p>A few details now. A world of possibilities next.</p>
      </div>
      <div className="planner-grid">
        <TripForm
          destination={destination}
          mockMode={
            process.env.TRIP_GENERATION_MODE === "mock" &&
            process.env.NODE_ENV !== "production"
          }
        />
        <aside className="planner-aside">
          <div className="aside-photo">
            <Image
              src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=900&q=80"
              alt="A peaceful lakeside destination in the mountains"
              fill
              unoptimized
              sizes="(max-width: 900px) 100vw, 360px"
            />
          </div>
          <div className="aside-copy">
            <Compass size={26} strokeWidth={1.4} />
            <h2>
              A plan is just
              <br />
              the beginning.
            </h2>
            <p>
              Leave a little room for the unexpected. The best moments
              aren&apos;t always on the itinerary.
            </p>
            <div className="aside-note">
              <ShieldCheck size={18} />
              <span>
                Your preview stays in this browser. No account needed.
              </span>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
