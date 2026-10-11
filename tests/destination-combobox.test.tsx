// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DestinationCombobox } from "@/components/trips/destination-combobox";
import type { Destination } from "@/features/trips/planning-schema";
const cities: Destination[] = [
  {
    id: "1850147",
    name: "Tokyo",
    region: "Tokyo",
    country: "Japan",
    countryCode: "JP",
    latitude: 35.6895,
    longitude: 139.6917,
    timezone: "Asia/Tokyo",
  },
  {
    id: "1",
    name: "Tokyo",
    region: "Example region",
    country: "Example country",
    countryCode: "US",
    latitude: 1,
    longitude: 1,
    timezone: "America/New_York",
  },
];
function Harness() {
  const [text, setText] = useState("Tok"),
    [city, setCity] = useState<Destination>();
  return (
    <>
      <label htmlFor="destination">Destination</label>
      <DestinationCombobox
        value={text}
        selected={city}
        onChange={(value) => {
          setText(value);
          setCity(undefined);
        }}
        onSelect={(value) => {
          setText(`${value.name}, ${value.country}`);
          setCity(value);
        }}
      />
    </>
  );
}
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ destinations: cities })),
  ),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("supports keyboard navigation, Enter selection and country disambiguation", async () => {
  render(<Harness />);
  const input = screen.getByRole("combobox");
  await userEvent.click(input);
  await screen.findAllByRole("option");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input).toHaveAttribute("aria-activedescendant");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(input).toHaveValue("Tokyo, Japan");
  expect(input).toHaveAttribute("aria-expanded", "false");
});
it("supports mouse selection and clears selection when the name changes", async () => {
  render(<Harness />);
  const input = screen.getByRole("combobox");
  await userEvent.click(input);
  const options = await screen.findAllByRole("option");
  await userEvent.click(options[1]);
  expect(input).toHaveValue("Tokyo, Example country");
  fireEvent.change(input, { target: { value: "Tor" } });
  await screen.findAllByRole("option");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("supports Escape, Tab and upward navigation without submitting a form", async () => {
  render(<Harness />);
  const input = screen.getByRole("combobox");
  await userEvent.click(input);
  await screen.findAllByRole("option");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "ArrowUp" });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(input).toHaveAttribute("aria-expanded", "false");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Tab" });
  expect(input).toHaveAttribute("aria-expanded", "false");
});
it("shows empty results without pretending text is verified", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ destinations: [] }));
  render(<Harness />);
  await userEvent.click(screen.getByRole("combobox"));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "No matching cities",
  );
});
it("shows a retryable source error without a fabricated fallback", async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
  render(<Harness />);
  await userEvent.click(screen.getByRole("combobox"));
  await screen.findByText(/City search is unavailable/);
  await userEvent.click(
    screen.getByRole("button", { name: "Retry city search" }),
  );
  await screen.findAllByRole("option");
});
it("avoids requests for short input and caches repeated searches", async () => {
  render(<Harness />);
  const input = screen.getByRole("combobox");
  await userEvent.click(input);
  await screen.findAllByRole("option");
  fireEvent.change(input, { target: { value: "T" } });
  await new Promise((done) => setTimeout(done, 300));
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: "Tok" } });
  await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
  expect(fetch).toHaveBeenCalledTimes(1);
});
