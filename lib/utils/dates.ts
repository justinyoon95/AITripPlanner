export const MAX_TRIP_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getInclusiveTripDayCount(startDate: Date, endDate: Date) {
  const start = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );
  const end = Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
  );

  return Math.floor((end - start) / MS_PER_DAY) + 1;
}

export function isWithinTripLengthLimit(
  startDate: Date,
  endDate: Date,
  maxDays = MAX_TRIP_DAYS,
) {
  const dayCount = getInclusiveTripDayCount(startDate, endDate);

  return dayCount >= 1 && dayCount <= maxDays;
}

export function formatDateRange(startDate: Date, endDate: Date) {
  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

export function formatDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}
