"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Maximize2, X } from "lucide-react";
import type { Map, Marker } from "maplibre-gl";
import {
  destinationSchema,
  type Destination,
} from "@/features/trips/planning-schema";
import { offlineMapStyle } from "@/features/trips/map-style";

const WORLD = { center: [10, 20] as [number, number], zoom: 1.2 };
export function DestinationMap({
  destination,
  heading,
}: {
  destination?: Destination;
  heading?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const compact = useRef<HTMLDivElement>(null);
  const expandedHost = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const expanded = useRef(false);
  const previousOverflow = useRef<string | null>(null);
  const titleId = useId();
  const validDestination = destinationSchema.safeParse(destination);
  const city = validDestination.success ? validDestination.data : undefined;
  const label = city ? `Explore ${city.name}` : "Explore your destination";
  const map = useRef<Map | null>(null),
    marker = useRef<Marker | null>(null);
  const latest = useRef(destination);
  const update = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState("Loading map...");
  const restoreCompact = useCallback(() => {
    if (!expanded.current) return;
    expanded.current = false;
    if (container.current && compact.current)
      compact.current.appendChild(container.current);
    map.current?.scrollZoom.disable();
    map.current?.cooperativeGestures.enable();
    map.current?.resize();
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
    trigger.current?.focus({ preventScroll: true });
  }, []);
  function expand() {
    if (
      expanded.current ||
      !dialog.current ||
      !container.current ||
      !expandedHost.current
    )
      return;
    dialog.current.showModal();
    expanded.current = true;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move the existing canvas, not a React portal that remounts MapLibre.
    expandedHost.current.appendChild(container.current);
    map.current?.scrollZoom.enable();
    map.current?.cooperativeGestures.disable();
    map.current?.resize();
  }
  useLayoutEffect(() => {
    const host = compact.current;
    const canvas = container.current;
    const modal = dialog.current;
    function cancel(event: Event) {
      event.preventDefault();
      modal?.close();
      restoreCompact();
    }
    function closed() {
      // Ignore a delayed close event if the user already reopened the dialog.
      if (!modal?.open) restoreCompact();
    }
    function trapFocus(event: KeyboardEvent) {
      if (event.key !== "Tab" || !modal?.open) return;
      const controls = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.getClientRects().length && !element.matches(":disabled"),
      );
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    // A native listener also receives events from the moved MapLibre DOM.
    modal?.addEventListener("keydown", trapFocus);
    modal?.addEventListener("cancel", cancel);
    modal?.addEventListener("close", closed);
    return () => {
      modal?.removeEventListener("keydown", trapFocus);
      modal?.removeEventListener("cancel", cancel);
      modal?.removeEventListener("close", closed);
      // Restore React's DOM ownership before its children are removed.
      if (host && canvas) host.appendChild(canvas);
      if (previousOverflow.current !== null) {
        document.body.style.overflow = previousOverflow.current;
        previousOverflow.current = null;
      }
    };
  }, [restoreCompact]);
  useEffect(() => {
    let disposed = false;
    let resize: ResizeObserver | undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    void import("maplibre-gl")
      .then((lib) => {
        if (disposed || !container.current) return;
        lib.setWorkerUrl(
          new URL(
            "maplibre-gl/dist/maplibre-gl-worker.mjs",
            import.meta.url,
          ).toString(),
        );
        const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
        let offline = !key;
        const instance = new lib.Map({
          container: container.current,
          style: key
            ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`
            : offlineMapStyle,
          ...WORLD,
          attributionControl: { compact: true },
          cooperativeGestures: true,
        });
        map.current = instance;
        if (expanded.current) {
          instance.scrollZoom.enable();
          instance.cooperativeGestures.disable();
        } else instance.scrollZoom.disable();
        instance.addControl(
          new lib.NavigationControl({ showCompass: false }),
          "top-right",
        );
        update.current = () => {
          if (disposed) return;
          marker.current?.remove();
          marker.current = null;
          const valid = destinationSchema.safeParse(latest.current);
          if (valid.success) {
            const city = valid.data;
            const center: [number, number] = [city.longitude, city.latitude];
            const label = document.createElement("div");
            label.className = "destination-marker";
            label.setAttribute("role", "img");
            label.setAttribute("aria-label", `${city.name}, ${city.country}`);
            label.title = `${city.name}, ${city.country}`;
            marker.current = new lib.Marker({ element: label })
              .setLngLat(center)
              .addTo(instance);
            instance.flyTo({
              center,
              zoom: offline ? 3.5 : 11,
              duration: media.matches ? 0 : 1500,
              essential: false,
            });
          } else {
            instance.flyTo({
              ...WORLD,
              duration: media.matches ? 0 : 1000,
              essential: false,
            });
          }
        };
        instance.on("load", () => {
          if (!disposed) {
            setStatus(offline ? "Offline geographic overview" : "");
            update.current?.();
          }
        });
        instance.on("error", () => {
          if (disposed) return;
          if (!offline) {
            offline = true;
            setStatus("Street map unavailable; geographic overview shown.");
            instance.setStyle(offlineMapStyle);
            update.current?.();
          } else
            setStatus(
              "Map details unavailable. Trip planning is still available.",
            );
        });
        resize = new ResizeObserver(() => instance.resize());
        resize.observe(container.current);
      })
      .catch(() => {
        if (!disposed)
          setStatus("Map unavailable. Trip planning is still available.");
      });
    return () => {
      disposed = true;
      resize?.disconnect();
      update.current = null;
      marker.current?.remove();
      marker.current = null;
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    latest.current = destination;
    update.current?.();
  }, [destination]);
  return (
    <section className="destination-map-section" aria-label="Destination map">
      <div className="destination-map-compact" ref={compact}>
        <div
          className="destination-map"
          ref={container}
          aria-label={city ? `Map of ${city.name}` : "World map"}
        />
      </div>
      <div className="destination-map-footer">
        <div className="destination-map-heading">
          <h2>{label}</h2>
          <span>
            {heading
              ? "Interactive destination preview"
              : (city?.country ?? "Interactive destination preview")}
          </span>
        </div>
        <button
          ref={trigger}
          type="button"
          className="map-expand"
          onClick={expand}
          aria-haspopup="dialog"
        >
          <Maximize2 size={16} aria-hidden="true" />
          Expand map
        </button>
      </div>
      <p className="map-status" role="status">
        {status || "\u00a0"}
      </p>
      <dialog
        ref={dialog}
        className="destination-map-dialog"
        aria-labelledby={titleId}
      >
        <div className="map-dialog-header">
          <h2 id={titleId}>{label}</h2>
          <button
            type="button"
            className="map-close"
            aria-label="Close expanded map"
            title="Close expanded map"
            onClick={() => {
              dialog.current?.close();
              restoreCompact();
            }}
            autoFocus
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="destination-map-expanded" ref={expandedHost} />
        <p className="map-status">
          {status || (city ? `${city.name}, ${city.country}` : "World map")}
        </p>
      </dialog>
    </section>
  );
}
