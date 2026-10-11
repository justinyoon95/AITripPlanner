import { expect, it, vi } from "vitest";
it("fails closed when local geographic data is unavailable", async () => {
  vi.resetModules();
  vi.doMock("node:fs", () => ({
    readFileSync: () => {
      throw new Error("missing file; internal details");
    },
  }));
  const { searchCities, resolveCity } = await import("@/lib/geography");
  expect(() => searchCities("Tok")).toThrow(
    expect.objectContaining({ code: "GEOGRAPHY_UNAVAILABLE", status: 503 }),
  );
  expect(() => resolveCity("Tokyo, Japan")).toThrow(/retry|unavailable/);
  vi.doUnmock("node:fs");
  vi.resetModules();
});
