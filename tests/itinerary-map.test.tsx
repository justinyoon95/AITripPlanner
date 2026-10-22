// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { ItineraryMap } from "@/components/trips/itinerary-map";
import { ItineraryView } from "@/components/trips/itinerary-view";
import { generateMockItinerary } from "@/features/trips/mock-generator";
import { locateActivity } from "@/features/trips/activity-locations";
import { input, previewId } from "./fixtures";

const state = vi.hoisted(() => ({
  maps: 0,
  fly: vi.fn(),
  fit: vi.fn(),
  remove: vi.fn(),
  resize: vi.fn(),
  fail: false,
  handlers: {} as Record<string, () => void>,
}));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  NavigationControl: class {},
  Map: class {
    constructor() {
      if (state.fail) throw Error("WebGL unavailable");
      state.maps++;
    }
    addControl() {}
    on(event: string, callback: () => void) {
      state.handlers[event] = callback;
      if (event === "load") queueMicrotask(callback);
    }
    flyTo = state.fly;
    fitBounds = state.fit;
    remove = state.remove;
    resize = state.resize;
    setStyle = vi.fn();
    scrollZoom = { enable: vi.fn(), disable: vi.fn() };
    cooperativeGestures = { enable: vi.fn(), disable: vi.fn() };
  },
  Marker: class {
    element: HTMLElement;
    constructor({ element }: { element: HTMLElement }) {
      this.element = element;
    }
    setLngLat() {
      return this;
    }
    addTo() {
      document.querySelector(".destination-map")?.appendChild(this.element);
      return this;
    }
    remove() {
      this.element.remove();
    }
  },
}));
function trip() {
  const t = generateMockItinerary(
    {
      ...input,
      resolvedDestination: {
        id: "1853909",
        name: "Osaka",
        region: "Osaka",
        country: "Japan",
        countryCode: "JP",
        latitude: 34.69,
        longitude: 135.5,
        timezone: "Asia/Tokyo",
      },
    },
    previewId,
  );
  t.days[0].activities[0] = locateActivity(
    { ...t.days[0].activities[0], name: "Osaka Castle" },
    t.input,
  );
  t.days[0].activities[1] = locateActivity(
    { ...t.days[0].activities[1], name: "Dotonbori" },
    t.input,
  );
  t.days[1].activities[0] = locateActivity(
    { ...t.days[1].activities[0], name: "Osaka Castle" },
    t.input,
  );
  return t;
}
function Harness() {
  const [t] = useState(trip),
    [day, setDay] = useState(t.days[0].id),
    [selected, setSelected] = useState<string | null>(null);
  return (
    <ItineraryView
      itinerary={t}
      selectedActivityId={selected}
      onLocateActivity={(d, id) => {
        setDay(d);
        setSelected(id);
      }}
      map={
        <ItineraryMap
          itinerary={t}
          dayId={day}
          selectedActivityId={selected}
          onDayChange={(id) => {
            setDay(id);
            setSelected(null);
          }}
          onSelectActivity={setSelected}
        />
      }
    />
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.maps = 0;
  state.fail = false;
  state.handlers = {};
  vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "");
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("fits reference-matched markers and lists unresolved activities without guessing coordinates", async () => {
  render(<Harness />);
  await waitFor(() => expect(state.fit).toHaveBeenCalled());
  expect(
    screen.getByRole("button", { name: "Show Osaka Castle on Day 1" }),
  ).toBeVisible();
  expect(
    screen.getByRole("list", { name: "Unresolved activity locations" }),
  ).toBeVisible();
  expect(state.maps).toBe(1);
});
it("marker selection highlights the same stable activity ID and renders safe details", async () => {
  const { container } = render(<Harness />);
  const marker = await screen.findByRole("button", {
    name: "Show Osaka Castle on Day 1",
  });
  marker.focus();
  fireEvent.click(marker);
  expect(
    screen.getByRole("button", { name: "Show Osaka Castle on Day 1" }),
  ).toHaveFocus();
  expect(
    container.querySelector('[data-map-selected="true"] h3'),
  ).toHaveTextContent("Osaka Castle");
  expect(
    screen.getByRole("link", { name: /Wikidata reference/ }),
  ).toHaveAttribute("href", "https://www.wikidata.org/wiki/Q321242");
  expect(state.fly).toHaveBeenLastCalledWith(
    expect.objectContaining({ duration: 0, zoom: 12 }),
  );
});
it("activity controls focus pins and day changes update markers without creating a second map", async () => {
  render(<Harness />);
  await screen.findByRole("button", { name: "Show Osaka Castle on Day 1" });
  fireEvent.click(
    screen.getByRole("button", { name: "Locate Dotonbori on Day 1" }),
  );
  expect(
    screen.getByRole("button", { name: "Show Dotonbori on Day 1" }),
  ).toHaveAttribute("aria-pressed", "true");
  fireEvent.change(screen.getByLabelText("Day", { exact: true }), {
    target: { value: trip().days[1].id },
  });
  await screen.findByRole("button", { name: "Show Osaka Castle on Day 2" });
  expect(
    screen.queryByRole("button", { name: "Show Dotonbori on Day 1" }),
  ).not.toBeInTheDocument();
  expect(state.maps).toBe(1);
});
it("cleans up markers/map and leaves form-independent content usable when initialization fails", async () => {
  const rendered = render(<Harness />);
  await screen.findByRole("button", { name: "Show Osaka Castle on Day 1" });
  rendered.unmount();
  expect(state.remove).toHaveBeenCalledOnce();
  state.fail = true;
  render(<Harness />);
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Map unavailable. Trip planning is still available.",
    ),
  );
  expect(
    screen.getByRole("heading", { name: input.destination }),
  ).toBeVisible();
});
it("rapid day changes and empty marker days remove stale pins", async () => {
  render(<Harness />);
  await screen.findByRole("button", { name: "Show Osaka Castle on Day 1" });
  fireEvent.change(screen.getByLabelText("Day", { exact: true }), {
    target: { value: trip().days[2].id },
  });
  expect(
    screen.queryByRole("button", { name: /Show Osaka Castle/ }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Day", { exact: true }), {
    target: { value: trip().days[0].id },
  });
  await screen.findByRole("button", { name: "Show Osaka Castle on Day 1" });
  expect(state.maps).toBe(1);
});
