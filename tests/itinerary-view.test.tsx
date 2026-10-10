// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ItineraryView } from "@/components/trips/itinerary-view";
import { normalizeAIItinerary } from "@/lib/ai/itinerary-service";
import { readPreview, storePreview } from "@/features/trips/storage";
import { aiFixture, input } from "./fixtures";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
it("renders AI overview, warnings, additional costs, and computed estimates", () => {
  const trip = normalizeAIItinerary(aiFixture(), input);
  render(<ItineraryView itinerary={trip} />);
  expect(screen.getByText(trip.overview!)).toBeVisible();
  expect(screen.getByText("AI-generated itinerary")).toBeVisible();
  expect(screen.getByText(trip.warnings[0])).toBeVisible();
  expect(screen.getAllByText("Accommodation")).toHaveLength(3);
  expect(screen.getByText("$325.00")).toBeVisible();
  expect(screen.getByText("$1,175.00")).toBeVisible();
});
it("shows budget overrun without an invalid progressbar value", () => {
  const trip = normalizeAIItinerary(aiFixture(), { ...input, budget: 1 });
  render(<ItineraryView itinerary={trip} />);
  expect(screen.getByText("Over budget")).toBeVisible();
  expect(screen.getByText("$324.00")).toBeVisible();
  expect(screen.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
});
it("retains all server identities when an AI preview is stored and reloaded", () => {
  const trip = normalizeAIItinerary(aiFixture(), input);
  storePreview(trip);
  expect(readPreview(trip.id)).toEqual(trip);
});
