import { describe, expect, it } from "vitest";

import { centsToDollars, dollarsToCents, formatCents } from "@/lib/utils/money";

describe("money utilities", () => {
  it("converts dollars to integer cents", () => {
    expect(dollarsToCents(123.45)).toBe(12345);
  });

  it("rounds cents safely for decimal inputs", () => {
    expect(dollarsToCents(10.999)).toBe(1100);
  });

  it("converts cents back to dollars", () => {
    expect(centsToDollars(2500)).toBe(25);
  });

  it("formats cents as currency", () => {
    expect(formatCents(250000, "USD")).toBe("$2,500");
  });
});
