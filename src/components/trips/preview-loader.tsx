"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, Compass } from "lucide-react";
import { readPreview } from "@/features/trips/storage";
import type { Itinerary } from "@/features/trips/types";
import { ItineraryView } from "./itinerary-view";
import { buttonVariants } from "@/components/ui/button";

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; itinerary: Itinerary }
  | { status: "missing" }
  | { status: "error"; message: string };
export function PreviewLoader({ id }: { id: string }) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  useEffect(() => {
    // Storage is browser-only; defer the read until the component has mounted.
    const timer = window.setTimeout(() => {
      try {
        const itinerary = readPreview(id);
        setState(
          itinerary ? { status: "ready", itinerary } : { status: "missing" },
        );
      } catch (error) {
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "This browser couldn't open the preview.",
        });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [id]);
  if (state.status === "loading")
    return (
      <div className="empty-state" role="status">
        <LoaderCircle size={28} className="spin" />
        <h1>Opening your itinerary...</h1>
      </div>
    );
  if (state.status !== "ready")
    return (
      <div className="empty-state">
        <Compass size={40} strokeWidth={1.3} />
        <h1>
          {state.status === "error"
            ? "We couldn't open this preview"
            : "Your next adventure is waiting"}
        </h1>
        <p>
          {state.status === "error"
            ? state.message
            : "This preview isn't in this browser. Previews stay on the device where you create them and disappear when you clear site data."}
        </p>
        <Link href="/trips/new" className={buttonVariants()}>
          Plan a trip
        </Link>
      </div>
    );
  return (
    <>
      <Link href="/trips/new" className="back-link">
        <ArrowLeft size={16} />
        Back to trip planner
      </Link>
      <ItineraryView itinerary={state.itinerary} />
    </>
  );
}
