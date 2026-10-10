"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, Compass } from "lucide-react";
import {
  readSession,
  recoverSession,
  updateStoredSession,
} from "@/features/trips/session-storage";
import { canonicalJSON } from "@/features/trips/fingerprint";
import type { TripSession } from "@/features/trips/session-schema";
import { TripWorkspace } from "./trip-workspace";
import { buttonVariants } from "@/components/ui/button";

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; session: TripSession; warning?: string }
  | { status: "missing" }
  | { status: "error"; message: string };
export function PreviewLoader({
  id,
  mockMode = false,
}: {
  id: string;
  mockMode?: boolean;
}) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  useEffect(() => {
    // Storage is browser-only; defer the read until the component has mounted.
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const stored = readSession(id);
        if (!stored) {
          if (!cancelled) setState({ status: "missing" });
          return;
        }
        const recovered = await recoverSession(stored);
        let warning: string | undefined;
        if (canonicalJSON(stored) !== canonicalJSON(recovered)) {
          try {
            await updateStoredSession(stored, () => recovered);
          } catch {
            warning =
              "Your saved itinerary is available, but this browser could not save the recovered conversation. Enable site storage and reload before editing.";
          }
        }
        if (!cancelled)
          setState({ status: "ready", session: recovered, warning });
      } catch (error) {
        if (!cancelled)
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "This browser couldn't open the preview.",
          });
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
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
      <TripWorkspace
        initial={state.session}
        mockMode={mockMode}
        initialWarning={state.warning}
      />
    </>
  );
}
