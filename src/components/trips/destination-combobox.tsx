"use client";
import { useEffect, useId, useRef, useState, type Ref } from "react";
import {
  destinationSchema,
  type Destination,
} from "@/features/trips/planning-schema";

export function DestinationCombobox({
  value,
  selected,
  onChange,
  onSelect,
  invalid,
  describedBy,
  inputRef,
  onBlur,
}: {
  value: string;
  selected?: Destination;
  onChange: (value: string) => void;
  onSelect: (city: Destination) => void;
  invalid?: boolean;
  describedBy?: string;
  inputRef?: Ref<HTMLInputElement>;
  onBlur?: () => void;
}) {
  const id = useId();
  const [options, setOptions] = useState<Destination[]>([]);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1),
    [status, setStatus] = useState("");
  const [retry, setRetry] = useState(0);
  const cache = useRef(new Map<string, Destination[]>());
  useEffect(() => {
    if (value.trim().length < 2 || selected) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("Searching cities...");
      try {
        let result = cache.current.get(value);
        if (!result) {
          const response = await fetch(
            `/api/destinations?q=${encodeURIComponent(value)}`,
            { signal: controller.signal },
          );
          const body = await response.json();
          if (!response.ok)
            throw new Error(body.error ?? "City search is unavailable.");
          result = destinationSchema.array().max(10).parse(body.destinations);
          if (cache.current.size >= 50) cache.current.clear();
          cache.current.set(value, result);
        }
        if (!controller.signal.aborted) {
          setOptions(result);
          setActive(-1);
          setStatus(
            result.length
              ? ""
              : "No matching cities. Try the city name and country.",
          );
        }
      } catch {
        if (!controller.signal.aborted) {
          setOptions([]);
          setStatus(
            "City search is unavailable. Retry before planning your trip.",
          );
        }
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, selected, retry]);
  const select = (city: Destination) => {
    onSelect(city);
    setOpen(false);
    setActive(-1);
  };
  return (
    <div className="destination-combobox">
      <input
        ref={inputRef}
        id="destination"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={
          open && active >= 0 ? `${id}-${active}` : undefined
        }
        aria-invalid={invalid}
        aria-describedby={describedBy}
        value={value}
        maxLength={100}
        autoComplete="off"
        placeholder="City, e.g. Tokyo, Japan"
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onBlur?.();
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOptions([]);
          setStatus("");
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (event.key === "Tab") {
            setOpen(false);
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((index) =>
              options.length
                ? index < 0
                  ? event.key === "ArrowDown"
                    ? 0
                    : options.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      options.length) %
                    options.length
                : -1,
            );
          }
          if (event.key === "Enter" && open) {
            event.preventDefault();
            if (active >= 0 && options[active]) select(options[active]);
          }
        }}
      />
      {open && value.length >= 2 && !selected && (
        <div className="destination-dropdown">
          <ul id={`${id}-list`} role="listbox" aria-label="Matching cities">
            {options.map((city, index) => (
              <li
                key={city.id}
                id={`${id}-${index}`}
                role="option"
                aria-selected={active === index}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(city)}
                onMouseEnter={() => setActive(index)}
              >
                <strong>{city.name}</strong>
                <span>
                  {[city.region, city.country].filter(Boolean).join(", ")}
                </span>
              </li>
            ))}
          </ul>
          {status && <p role="status">{status}</p>}
          {status.includes("unavailable") && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry city search
            </button>
          )}
        </div>
      )}
    </div>
  );
}
