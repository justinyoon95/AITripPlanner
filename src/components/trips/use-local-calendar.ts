"use client";
import { useSyncExternalStore } from "react";
import { calendarDate } from "@/features/trips/calendar";
function subscribe(update: () => void) {
  window.addEventListener("focus", update);
  const interval = window.setInterval(update, 60_000);
  return () => {
    window.removeEventListener("focus", update);
    window.clearInterval(interval);
  };
}
function snapshot() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${calendarDate(new Date(), timezone)}|${timezone}`;
}
export function useLocalCalendar() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "");
  const [today, timezone] = value.split("|");
  return { today, timezone };
}
