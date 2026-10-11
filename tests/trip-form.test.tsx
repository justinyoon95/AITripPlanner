// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TripForm } from "@/components/trips/trip-form";
import { generateMockItinerary } from "@/features/trips/mock-generator";
import { input, previewId } from "./fixtures";
const { generate, store, push } = vi.hoisted(() => ({
  generate: vi.fn(),
  store: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/features/trips/generate-client", () => ({
  requestItinerary: generate,
}));
vi.mock("@/features/trips/storage", () => ({ storePreview: store }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const itinerary = generateMockItinerary(input, previewId);
beforeEach(() => {
  vi.resetAllMocks();
  generate.mockResolvedValue(itinerary);
  const city = {
    id: "1857910",
    name: "Kyoto",
    region: "Kyoto",
    countryCode: "JP",
    country: "Japan",
    latitude: 35.02107,
    longitude: 135.75385,
    timezone: "Asia/Tokyo",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ destination: city, destinations: [city] }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function fill(endDate = input.endDate) {
  render(<TripForm destination={input.destination} />);
  fireEvent.change(screen.getByLabelText("Start date"), {
    target: { value: input.startDate },
  });
  fireEvent.change(screen.getByLabelText("End date"), {
    target: { value: endDate },
  });
  await userEvent.type(screen.getByLabelText("Total trip budget"), "1500");
  await userEvent.click(screen.getByLabelText("Food"));
}
it("shows loading, blocks duplicates, persists and navigates on success", async () => {
  let resolve!: (value: typeof itinerary) => void;
  generate.mockReturnValue(
    new Promise<typeof itinerary>((done) => {
      resolve = done;
    }),
  );
  await fill();
  const button = screen.getByRole("button", { name: "Preview my itinerary" });
  await userEvent.click(button);
  expect(
    screen.getByRole("button", { name: "Generating your itinerary..." }),
  ).toBeDisabled();
  fireEvent.submit(button.closest("form")!);
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  expect(push).not.toHaveBeenCalled();
  await act(async () => resolve(itinerary));
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/trips/${previewId}`));
  expect(store).toHaveBeenCalledWith(itinerary);
});
it("shows generation errors without storing or navigating and allows retry", async () => {
  generate.mockRejectedValueOnce(new Error("AI generation is unavailable."));
  await fill();
  await userEvent.click(
    screen.getByRole("button", { name: "Preview my itinerary" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "AI generation is unavailable.",
  );
  expect(store).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Preview my itinerary" }),
  );
  await waitFor(() => expect(push).toHaveBeenCalled());
  expect(generate).toHaveBeenCalledTimes(2);
});
it("retries failed storage without paying for a second generation", async () => {
  store.mockImplementationOnce(() => {
    throw new Error("Enable site storage");
  });
  await fill();
  await userEvent.click(
    screen.getByRole("button", { name: "Preview my itinerary" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Enable site storage",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Preview my itinerary" }),
  );
  await waitFor(() => expect(push).toHaveBeenCalled());
  expect(generate).toHaveBeenCalledTimes(1);
  expect(store).toHaveBeenCalledTimes(2);
});
it("validates the same inclusive 14-day limit before calling the API", async () => {
  await fill("2026-12-15");
  await userEvent.click(
    screen.getByRole("button", { name: "Preview my itinerary" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "14 days or fewer",
  );
  expect(generate).not.toHaveBeenCalled();
});
it("clears an invalidated end date rather than silently shifting it", async () => {
  await fill();
  fireEvent.change(screen.getByLabelText("Start date"), {
    target: { value: "2026-12-10" },
  });
  expect(screen.getByLabelText("End date")).toHaveValue("");
  expect(screen.getByLabelText("End date")).toHaveAttribute(
    "min",
    "2026-12-10",
  );
  expect(screen.getByLabelText("End date")).toHaveAttribute(
    "max",
    "2026-12-23",
  );
  expect(generate).not.toHaveBeenCalled();
});
it("keeps optional details collapsed and resolves manual text before generation", async () => {
  await fill();
  expect(document.querySelector("details")).not.toHaveAttribute("open");
  await userEvent.click(
    screen.getByRole("button", { name: "Preview my itinerary" }),
  );
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  expect(generate.mock.calls[0][0].resolvedDestination.id).toBe("1857910");
  expect(generate.mock.calls[0][0].travelers).toBe(1);
  expect(generate.mock.calls[0][0].seasonalPreference).toBe("include");
});
it("does not generate a trip when typed geography cannot be resolved", async () => {
  vi.mocked(fetch).mockImplementation(async () =>
    Response.json({ error: "Select a city and country." }, { status: 400 }),
  );
  await fill();
  await userEvent.click(
    screen.getByRole("button", { name: "Preview my itinerary" }),
  );
  await screen.findByText("Select a city and country.");
  expect(generate).not.toHaveBeenCalled();
  expect(store).not.toHaveBeenCalled();
});
