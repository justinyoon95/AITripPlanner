import { describe, expect, it } from "vitest";

import {
  formatDateRange,
  getInclusiveTripDayCount,
  isWithinTripLengthLimit,
} from "@/lib/utils/dates";

describe("trip date utilities", () => {
  it("counts trip days inclusively", () => {
    expect(
      getInclusiveTripDayCount(
        new Date("2026-06-01"),
        new Date("2026-06-03"),
      ),
    ).toBe(3);
  });

  it("accepts trips within the MVP day limit", () => {
    expect(
      isWithinTripLengthLimit(
        new Date("2026-06-01"),
        new Date("2026-06-14"),
      ),
    ).toBe(true);
  });

  it("rejects trips longer than the MVP day limit", () => {
    expect(
      isWithinTripLengthLimit(
        new Date("2026-06-01"),
        new Date("2026-06-15"),
      ),
    ).toBe(false);
  });

  it("formats date ranges for trip summaries", () => {
    expect(
      formatDateRange(new Date("2026-06-01"), new Date("2026-06-03")),
    ).toBe("Jun 1, 2026 - Jun 3, 2026");
  });
});
