// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DestinationPhoto } from "@/components/trips/destination-photo";
import { DestinationMap } from "@/components/trips/destination-map";
import { TripForm } from "@/components/trips/trip-form";
import type { Destination } from "@/features/trips/planning-schema";
import { renderToString } from "react-dom/server";
import HomePage from "@/app/page";
import { TripPlanningExperience } from "@/components/trips/trip-planning-experience";
import {
  DEFAULT_DESTINATION_PHOTO,
  type DestinationPhoto as Photo,
} from "@/features/trips/destination-media";

const state = vi.hoisted(() => ({
  photo: vi.fn(),
  fly: vi.fn(),
  removeMap: vi.fn(),
  removeMarker: vi.fn(),
  center: vi.fn(),
  addMarker: vi.fn(),
  style: vi.fn(),
  disconnect: vi.fn(),
  resize: vi.fn(),
  enableWheel: vi.fn(),
  disableWheel: vi.fn(),
  gestures: vi.fn(),
  failInitialization: false,
  maps: [] as Record<string, unknown>[],
  handlers: {} as Record<string, () => void>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/trips/photo-client", () => ({
  requestDestinationPhoto: state.photo,
}));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  Map: class {
    constructor(options: Record<string, unknown>) {
      if (state.failInitialization) throw new Error("WebGL unavailable");
      state.maps.push(options);
    }
    addControl(control: { onAdd?: () => HTMLElement }) {
      const element = control.onAdd?.();
      if (element)
        document.querySelector(".destination-map")?.appendChild(element);
    }
    on(event: string, callback: () => void) {
      state.handlers[event] = callback;
    }
    flyTo = state.fly;
    remove = state.removeMap;
    setStyle = state.style;
    resize = state.resize;
    scrollZoom = { enable: state.enableWheel, disable: state.disableWheel };
    cooperativeGestures = {
      enable: () => state.gestures(true),
      disable: () => state.gestures(false),
    };
  },
  Marker: class {
    remove = state.removeMarker;
    setLngLat(center: number[]) {
      state.center(center);
      return this;
    }
    addTo() {
      state.addMarker();
      return this;
    }
  },
  NavigationControl: class {},
}));
const tokyo: Destination = {
  id: "1850147",
  name: "Tokyo",
  region: "Tokyo",
  country: "Japan",
  countryCode: "JP",
  latitude: 35.69,
  longitude: 139.69,
  timezone: "Asia/Tokyo",
};
const paris: Destination = {
  ...tokyo,
  id: "2988507",
  name: "Paris",
  region: "Ile-de-France",
  country: "France",
  countryCode: "FR",
  latitude: 48.85,
  longitude: 2.35,
  timezone: "Europe/Paris",
};
const photo = (city = tokyo): Photo => ({
  photoId: `test-${city.id}`,
  usageToken: "x".repeat(30),
  cityId: city.id,
  url: `https://images.unsplash.com/photo-${city.id}`,
  alt: `${city.name} scenery`,
  photographer: "Example",
  photographerURL: "https://unsplash.com/@example",
  photoURL: "https://unsplash.com/photos/example",
});
const dialogMethods = ["showModal", "close"] as const;
const originalDialogMethods = dialogMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
);
beforeEach(() => {
  vi.clearAllMocks();
  state.maps.length = 0;
  state.failInitialization = false;
  state.handlers = {};
  state.photo.mockResolvedValue(null);
  vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ destinations: [tokyo] })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect = state.disconnect;
    },
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
      this.querySelector<HTMLButtonElement>("button")?.focus();
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  dialogMethods.forEach((name, index) => {
    const descriptor = originalDialogMethods[index];
    if (descriptor)
      Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  });
});
it("renders the default photo without a selection or request", () => {
  render(<DestinationPhoto />);
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    DEFAULT_DESTINATION_PHOTO,
  );
  expect(state.photo).not.toHaveBeenCalled();
});
it("crossfades only after image load and shows linked photographer attribution", async () => {
  state.photo.mockResolvedValue(photo());
  render(<DestinationPhoto destination={tokyo} />);
  await waitFor(() =>
    expect(document.querySelector("img.city-photo")).not.toBeNull(),
  );
  const image = document.querySelector("img.city-photo")!;
  expect(image).not.toHaveClass("is-visible");
  fireEvent.load(image);
  await waitFor(() => expect(image).toHaveClass("is-visible"));
  expect(image).toHaveAttribute("src", photo().url);
  expect(image.getAttribute("src")).not.toContain("/_next/image");
  expect(screen.getByRole("link", { name: "Example" })).toHaveAttribute(
    "href",
    photo().photographerURL,
  );
});
it("returns to default after clearing a destination", async () => {
  state.photo.mockResolvedValue(photo());
  const view = render(<DestinationPhoto destination={tokyo} />);
  await waitFor(() =>
    expect(document.querySelector("img.city-photo")).not.toBeNull(),
  );
  view.rerender(<DestinationPhoto />);
  expect(document.querySelector("img.city-photo")).toBeNull();
});
it("handles missing configuration and rejected photo requests", async () => {
  state.photo.mockRejectedValue(new Error("unavailable"));
  render(<DestinationPhoto destination={tokyo} />);
  await act(async () => {});
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    DEFAULT_DESTINATION_PHOTO,
  );
});
it("restores default when an image fails", async () => {
  state.photo.mockResolvedValue(photo());
  render(<DestinationPhoto destination={tokyo} />);
  await waitFor(() =>
    expect(document.querySelector("img.city-photo")).not.toBeNull(),
  );
  const image = document.querySelector("img.city-photo")!;
  fireEvent.error(image);
  expect(image).not.toHaveClass("is-visible");
  expect(screen.getByRole("link", { name: "Luca Bravo" })).toBeInTheDocument();
});
it("attributes the unchanged fallback with verified photographer links and referrals", () => {
  render(<DestinationPhoto />);
  expect(screen.getByRole("link", { name: "Luca Bravo" })).toHaveAttribute(
    "href",
    expect.stringContaining("utm_source=tripplannerai&utm_medium=referral"),
  );
  expect(screen.getByRole("link", { name: "Unsplash" })).toHaveAttribute(
    "href",
    expect.stringContaining("O453M2Liufs"),
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("also attributes the identical pre-existing lake hero on the landing page", () => {
  render(<HomePage />);
  const hero = within(document.querySelector(".hero") as HTMLElement);
  expect(hero.getByRole("link", { name: "Luca Bravo" })).toHaveAttribute(
    "href",
    expect.stringContaining("utm_medium=referral"),
  );
  expect(hero.getByRole("link", { name: "Unsplash" })).toHaveAttribute(
    "href",
    expect.stringContaining("O453M2Liufs"),
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("attributes every landing card with verified identities and separate clickable referral links", () => {
  render(<HomePage />);
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>(".destination-card"),
  );
  expect(cards).toHaveLength(3);
  for (const [index, card] of cards.entries()) {
    const photographer = [
      "Sorasak",
      "Claudio Schwarz",
      "Willdwind / William Martret",
    ][index];
    const id = ["_UIN-pFfJ7c", "K3XGEoZgA0s", "gB6hdqxoqSk"][index];
    expect(
      within(card).getByRole("link", { name: photographer }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(
        /unsplash\.com\/@.+\?utm_source=tripplannerai&utm_medium=referral/,
      ),
    );
    expect(
      within(card).getByRole("link", { name: "Unsplash" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining(
        `${id}?utm_source=tripplannerai&utm_medium=referral`,
      ),
    );
    expect(card.querySelector("a a")).toBeNull();
    expect(card.querySelector("img")?.getAttribute("src")).toMatch(
      /^https:\/\/images\.unsplash\.com\//,
    );
  }
  expect(fetch).not.toHaveBeenCalled();
});
it("tracks a successful hero use once, not metadata search or repeated image load", async () => {
  state.photo.mockResolvedValue(photo());
  render(<DestinationPhoto destination={tokyo} />);
  await waitFor(() =>
    expect(document.querySelector("img.city-photo")).not.toBeNull(),
  );
  expect(fetch).not.toHaveBeenCalled();
  const img = document.querySelector("img.city-photo")!;
  fireEvent.load(img);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  fireEvent.load(img);
  await act(async () => {});
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    "/api/destination-photo",
    expect.objectContaining({
      method: "POST",
      body: expect.stringContaining(photo().usageToken),
    }),
  );
});
it("does not track failed images", async () => {
  state.photo.mockResolvedValue(photo());
  render(<DestinationPhoto destination={tokyo} />);
  await waitFor(() =>
    expect(document.querySelector("img.city-photo")).not.toBeNull(),
  );
  fireEvent.error(document.querySelector("img.city-photo")!);
  expect(fetch).not.toHaveBeenCalled();
});
it("counts a new selection separately after clearing rather than deduplicating forever", async () => {
  state.photo.mockResolvedValue(photo());
  const view = render(<DestinationPhoto destination={tokyo} />);
  await waitFor(() =>
    expect(document.querySelector("img.city-photo")).not.toBeNull(),
  );
  fireEvent.load(document.querySelector("img.city-photo")!);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  view.rerender(<DestinationPhoto />);
  view.rerender(<DestinationPhoto destination={tokyo} />);
  await waitFor(() =>
    expect(document.querySelector("img.city-photo")).not.toBeNull(),
  );
  fireEvent.load(document.querySelector("img.city-photo")!);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(fetch).mock.calls;
  expect(
    JSON.parse((calls[0][1] as RequestInit).body as string).eventId,
  ).not.toBe(JSON.parse((calls[1][1] as RequestInit).body as string).eventId);
});
it("ignores stale responses after rapid destination switching", async () => {
  let finish!: (value: Photo) => void;
  state.photo
    .mockReturnValueOnce(
      new Promise<Photo>((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValueOnce(photo(paris));
  const view = render(<DestinationPhoto destination={tokyo} />);
  view.rerender(<DestinationPhoto destination={paris} />);
  await waitFor(() =>
    expect(document.querySelector("img.city-photo")).toHaveAttribute(
      "src",
      photo(paris).url,
    ),
  );
  await act(async () => finish(photo(tokyo)));
  expect(document.querySelector("img.city-photo")).toHaveAttribute(
    "src",
    photo(paris).url,
  );
});
it("initializes offline world view client-side, resizes and cleans up", async () => {
  const view = render(<DestinationMap />);
  await waitFor(() => expect(state.maps).toHaveLength(1));
  expect(state.maps[0].center).toEqual([10, 20]);
  act(() => state.handlers.load());
  expect(state.fly).toHaveBeenLastCalledWith(
    expect.objectContaining({ zoom: 1.2 }),
  );
  view.unmount();
  expect(state.removeMap).toHaveBeenCalledTimes(1);
  expect(state.disconnect).toHaveBeenCalledTimes(1);
});
it("does not initialize MapLibre during server rendering", () => {
  expect(renderToString(<DestinationMap destination={tokyo} />)).toContain(
    "Destination map",
  );
  expect(state.maps).toHaveLength(0);
});
it("expands the same canvas, preserves its camera and restores focus and scrolling", async () => {
  document.body.style.overflow = "auto";
  const view = render(<DestinationMap destination={tokyo} />);
  await waitFor(() => expect(state.maps).toHaveLength(1));
  act(() => state.handlers.load());
  const canvas = screen.getByLabelText("Map of Tokyo");
  const trigger = screen.getByRole("button", { name: "Expand map" });
  const flights = state.fly.mock.calls.length;
  fireEvent.click(trigger);
  expect(
    screen.getByRole("dialog", { name: "Explore Tokyo" }),
  ).toContainElement(canvas);
  expect(
    screen.getByRole("button", { name: "Close expanded map" }),
  ).toHaveFocus();
  expect(document.body.style.overflow).toBe("hidden");
  expect(state.enableWheel).toHaveBeenCalledOnce();
  expect(state.resize).toHaveBeenCalled();
  expect(state.maps).toHaveLength(1);
  expect(state.fly).toHaveBeenCalledTimes(flights);
  view.rerender(<DestinationMap destination={paris} />);
  expect(
    screen.getByRole("dialog", { name: "Explore Paris" }),
  ).toContainElement(canvas);
  expect(state.center).toHaveBeenLastCalledWith([
    paris.longitude,
    paris.latitude,
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Close expanded map" }));
  expect(document.querySelector(".destination-map-compact")).toContainElement(
    canvas,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).toBe("auto");
  expect(state.disableWheel).toHaveBeenCalledTimes(2);
  view.unmount();
  document.body.style.overflow = "";
});
it("closes on native Escape cancellation and restores the compact map", async () => {
  render(<DestinationMap />);
  await waitFor(() => expect(state.maps).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: "Expand map" }));
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Expand map" })).toHaveFocus();
  expect(document.body.style.overflow).not.toBe("hidden");
});
it("wraps Tab and Shift+Tab including controls inside the transferred canvas", async () => {
  render(<DestinationMap />);
  await waitFor(() => expect(state.maps).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: "Expand map" }));
  const close = screen.getByRole("button", { name: "Close expanded map" });
  const last = document.createElement("button");
  last.textContent = "Mock map control";
  screen.getByLabelText("World map").appendChild(last);
  vi.spyOn(close, "getClientRects").mockReturnValue([
    {},
  ] as unknown as DOMRectList);
  vi.spyOn(last, "getClientRects").mockReturnValue([
    {},
  ] as unknown as DOMRectList);
  last.focus();
  fireEvent.keyDown(last, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
  expect(last).toHaveFocus();
});
it("allows expansion before initialization completes without starting a second map", async () => {
  render(<DestinationMap />);
  fireEvent.click(screen.getByRole("button", { name: "Expand map" }));
  await waitFor(() => expect(state.maps).toHaveLength(1));
  expect(state.enableWheel).toHaveBeenCalled();
  expect(state.gestures).toHaveBeenCalledWith(false);
  fireEvent.click(screen.getByRole("button", { name: "Close expanded map" }));
  fireEvent.click(screen.getByRole("button", { name: "Expand map" }));
  expect(state.maps).toHaveLength(1);
});
it("cleans up an expanded canvas without losing DOM ownership or scroll settings", async () => {
  const view = render(<DestinationMap />);
  await waitFor(() => expect(state.maps).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: "Expand map" }));
  expect(() => view.unmount()).not.toThrow();
  expect(state.removeMap).toHaveBeenCalledOnce();
  expect(document.body.style.overflow).not.toBe("hidden");
});
it("handles initialization failure with an expandable, nonblocking fallback", async () => {
  state.failInitialization = true;
  render(<DestinationMap />);
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Map unavailable"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Expand map" }));
  expect(screen.getByRole("dialog")).toHaveTextContent(
    "Trip planning is still available",
  );
  fireEvent.click(screen.getByRole("button", { name: "Close expanded map" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("uses city zoom only with the configured tile provider", async () => {
  vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "test-public-token");
  render(<DestinationMap destination={tokyo} />);
  await waitFor(() => expect(state.maps).toHaveLength(1));
  act(() => state.handlers.load());
  expect(state.fly).toHaveBeenLastCalledWith(
    expect.objectContaining({ zoom: 11 }),
  );
});
it("adds the official linked MapTiler logo and keeps text attribution expanded", async () => {
  vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "test-public-token");
  render(<DestinationMap destination={tokyo} />);
  await waitFor(() => expect(state.maps).toHaveLength(1));
  const logo = await screen.findByRole("img", { name: "MapTiler logo" });
  expect(logo).toHaveAttribute(
    "src",
    "https://api.maptiler.com/resources/logo.svg",
  );
  expect(logo.closest("a")).toHaveAttribute("href", "https://www.maptiler.com");
  expect(state.maps[0].attributionControl).toEqual({ compact: false });
  expect(document.querySelectorAll(".maptiler-logo")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Expand map" }));
  expect(
    within(screen.getByRole("dialog")).getByRole("img", {
      name: "MapTiler logo",
    }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Close expanded map" }));
  expect(document.querySelectorAll(".maptiler-logo")).toHaveLength(1);
  expect(state.maps).toHaveLength(1);
  act(() => state.handlers.error());
  expect(
    screen.getByRole("img", { name: "MapTiler logo" }),
  ).toBeInTheDocument();
});
it("does not load a provider logo for the credential-free offline map", async () => {
  render(<DestinationMap destination={tokyo} />);
  await waitFor(() => expect(state.maps).toHaveLength(1));
  expect(screen.queryByRole("img", { name: "MapTiler logo" })).toBeNull();
});
it("flies using selected geographic coordinates and clears the marker", async () => {
  const view = render(<DestinationMap destination={tokyo} />);
  await waitFor(() => expect(state.maps).toHaveLength(1));
  act(() => state.handlers.load());
  expect(state.center).toHaveBeenLastCalledWith([
    tokyo.longitude,
    tokyo.latitude,
  ]);
  view.rerender(<DestinationMap destination={paris} />);
  expect(state.fly).toHaveBeenLastCalledWith(
    expect.objectContaining({
      center: [paris.longitude, paris.latitude],
      duration: 1500,
    }),
  );
  view.rerender(<DestinationMap />);
  expect(state.removeMarker).toHaveBeenCalled();
  expect(state.fly).toHaveBeenLastCalledWith(
    expect.objectContaining({ zoom: 1.2 }),
  );
});
it("respects reduced-motion settings", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  render(<DestinationMap destination={tokyo} />);
  await waitFor(() => expect(state.maps).toHaveLength(1));
  act(() => state.handlers.load());
  expect(state.fly).toHaveBeenLastCalledWith(
    expect.objectContaining({ duration: 0, essential: false }),
  );
});
it("does not pass invalid coordinates to MapLibre", async () => {
  render(<DestinationMap destination={{ ...tokyo, latitude: NaN }} />);
  await waitFor(() => expect(state.maps).toHaveLength(1));
  act(() => state.handlers.load());
  expect(state.center).not.toHaveBeenCalled();
  expect(state.fly).toHaveBeenLastCalledWith(
    expect.objectContaining({ zoom: 1.2 }),
  );
});
it("falls back from failed tiles to offline data without blocking the form", async () => {
  vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "test-public-token");
  render(<DestinationMap destination={tokyo} />);
  await waitFor(() => expect(state.maps).toHaveLength(1));
  act(() => state.handlers.error());
  expect(state.style).toHaveBeenCalledWith(
    expect.objectContaining({ sources: expect.any(Object) }),
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Street map unavailable",
  );
});
it("shares one confirmed destination with both visuals; typing is not selection", async () => {
  render(
    <TripForm
      renderDestination={(city) => (
        <output data-testid="selection">{city?.id ?? "none"}</output>
      )}
    />,
  );
  const field = screen.getByRole("combobox", { name: "Where are you headed?" });
  fireEvent.change(field, { target: { value: "Tok" } });
  expect(screen.getByTestId("selection")).toHaveTextContent("none");
  const option = await screen.findByRole("option", {
    name: "Tokyo Tokyo, Japan",
  });
  expect(within(screen.getByRole("listbox")).getByRole("option")).toBe(option);
  fireEvent.click(option);
  expect(screen.getByTestId("selection")).toHaveTextContent(tokyo.id);
  fireEvent.change(field, { target: { value: "Par" } });
  expect(screen.getByTestId("selection")).toHaveTextContent(tokyo.id);
  fireEvent.change(field, { target: { value: "" } });
  expect(screen.getByTestId("selection")).toHaveTextContent("none");
});
it("renders one full-width hero and places the map above destination input", async () => {
  const { container } = render(
    <TripPlanningExperience destination="" mockMode />,
  );
  const hero = container.querySelector(".planner-hero")!;
  const form = container.querySelector(".planner-form")!;
  expect(hero).toContainElement(
    screen.getByRole("heading", { name: "Make room for adventure." }),
  );
  expect(
    hero.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(hero.querySelector("img")).toHaveAttribute(
    "src",
    DEFAULT_DESTINATION_PHOTO,
  );
  // Next omits srcset/sizes for direct unoptimized hotlinks; CSS supplies the
  // full-width frame, verified at actual browser viewports below.
  expect(hero.querySelector("img")).not.toHaveAttribute("srcset");
  expect(hero.querySelector(".destination-photo--hero")).toBeInTheDocument();
  expect(hero.querySelector("img")).toHaveAttribute("loading", "eager");
  expect(container.querySelectorAll(".destination-photo")).toHaveLength(1);
  expect(container.querySelector(".planner-aside")).toBeNull();
  expect(form.firstElementChild).toHaveTextContent("The essentials");
  const essentials = form.querySelector(".form-section")!;
  const preview = form.querySelector(".planner-destination-preview")!;
  expect(preview.parentElement).toBe(essentials);
  expect(preview.previousElementSibling).toHaveTextContent("The essentials");
  expect(preview.nextElementSibling).toContainElement(
    screen.getByRole("combobox", { name: "Where are you headed?" }),
  );
  expect(preview.nextElementSibling?.nextElementSibling).toContainElement(
    screen.getByLabelText("Start date"),
  );
  expect(
    within(hero as HTMLElement).getByRole("link", {
      name: "Back to exploring",
    }),
  ).toHaveAttribute("href", "/");
});
it("updates the cinematic hero and relocated map without duplicate requests or use events on form changes", async () => {
  state.photo.mockResolvedValue(photo());
  const { container } = render(
    <TripPlanningExperience destination="" mockMode />,
  );
  const field = screen.getByRole("combobox", { name: "Where are you headed?" });
  fireEvent.change(field, { target: { value: "Tok" } });
  expect(state.photo).not.toHaveBeenCalled();
  fireEvent.click(
    await screen.findByRole("option", { name: "Tokyo Tokyo, Japan" }),
  );
  await waitFor(() =>
    expect(container.querySelector(".planner-hero .city-photo")).not.toBeNull(),
  );
  const image = container.querySelector(".planner-hero .city-photo")!;
  fireEvent.load(image);
  await waitFor(() => expect(image).toHaveClass("is-visible"));
  await waitFor(() => expect(state.maps).toHaveLength(1));
  act(() => state.handlers.load());
  expect(state.center).toHaveBeenLastCalledWith([
    tokyo.longitude,
    tokyo.latitude,
  ]);
  fireEvent.change(screen.getByLabelText("Total trip budget"), {
    target: { value: "2500" },
  });
  fireEvent.change(screen.getByLabelText("Start date"), {
    target: { value: "2027-04-15" },
  });
  expect(state.photo).toHaveBeenCalledTimes(1);
  expect(
    vi
      .mocked(fetch)
      .mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(1);
  expect(container.querySelectorAll(".destination-photo")).toHaveLength(1);
  fireEvent.change(field, { target: { value: "Par" } });
  expect(image).toBeInTheDocument();
  expect(state.photo).toHaveBeenCalledTimes(1);
  fireEvent.change(field, { target: { value: "" } });
  expect(container.querySelector(".city-photo")).toBeNull();
  expect(state.fly).toHaveBeenLastCalledWith(
    expect.objectContaining({ zoom: 1.2 }),
  );
});
