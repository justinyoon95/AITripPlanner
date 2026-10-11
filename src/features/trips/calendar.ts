import { z } from "zod";

export const DAY_MS = 86_400_000;
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Choose a valid calendar date.");
export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time (HH:MM).");
export const timezoneSchema = z
  .string()
  .min(1)
  .max(80)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, "Choose a supported timezone.");
export function calendarDate(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function addDays(date: string, count: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + count * DAY_MS)
    .toISOString()
    .slice(0, 10);
}
export function latestEndDate(start: string) {
  const limit = addDays(start, 13);
  return dateSchema.safeParse(limit).success ? limit : "9999-12-31";
}
export function tripDayCount(start: string, end: string) {
  return (
    Math.round(
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
        DAY_MS,
    ) + 1
  );
}
export function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function clock(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
export function localDateTime(instant: number, timezone: string) {
  const date = new Date(instant);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return { date: calendarDate(date, timezone), time };
}
// Solve a wall-clock time using adjacent offsets; reject DST gaps/folds rather
// than silently choosing one instant or interpreting airport-local input as UTC.
export function wallClockInstant(date: string, time: string, timezone: string) {
  const naive = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set(
    [-DAY_MS, 0, DAY_MS].map((delta) => {
      const local = localDateTime(naive + delta, timezone);
      return Date.parse(`${local.date}T${local.time}:00Z`) - (naive + delta);
    }),
  );
  const candidates = [...offsets]
    .map((offset) => naive - offset)
    .filter((instant) => {
      const local = localDateTime(instant, timezone);
      return local.date === date && local.time === time;
    });
  if (candidates.length !== 1)
    throw new Error(
      "This local time is ambiguous or unavailable due to daylight saving. Choose an unambiguous time.",
    );
  return candidates[0];
}
