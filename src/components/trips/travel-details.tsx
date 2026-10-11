"use client";
import { useFormContext, useWatch, type FieldPath } from "react-hook-form";
import type { TripInput } from "@/features/trips/types";
import { airportSchema } from "@/features/trips/planning-schema";
import { dateSchema } from "@/features/trips/calendar";

export function TravelDetails() {
  const {
    register,
    getFieldState,
    formState,
    getValues,
    setValue,
    setError,
    clearErrors,
    trigger,
  } = useFormContext<TripInput>();
  const travel = useWatch<TripInput, "travel">({ name: "travel" });
  const field = (
    name: FieldPath<TripInput>,
    label: string,
    type = "text",
    length = 200,
  ) => {
    const error = getFieldState(name, formState).error;
    return (
      <div className="field" key={name}>
        <label htmlFor={name}>{label}</label>
        <input
          id={name}
          type={type}
          maxLength={length}
          max={type === "date" ? "9999-12-31" : undefined}
          aria-invalid={!!error}
          aria-describedby={error ? `${name}-error` : undefined}
          {...register(name, {
            setValueAs: (value) =>
              typeof value === "string" && value.trim() === ""
                ? undefined
                : value,
            onChange: (event) => {
              if (name.endsWith("airportCode"))
                setValue(
                  name.includes("arrival")
                    ? "travel.arrival.airport"
                    : "travel.departure.airport",
                  undefined,
                );
              void trigger();
              if (
                type === "date" &&
                event.target.value &&
                !dateSchema.safeParse(event.target.value).success
              )
                setError(name, {
                  message: "Choose a real four-digit-year calendar date.",
                });
            },
            onBlur: async () => {
              if (!name.endsWith("airportCode")) return;
              const kind = name.includes("arrival") ? "arrival" : "departure";
              const code = getValues(`travel.${kind}.airportCode`);
              setValue(`travel.${kind}.airport`, undefined);
              if (!code) return;
              try {
                const response = await fetch(
                  `/api/airports?code=${encodeURIComponent(code)}`,
                );
                const body = await response.json();
                if (!response.ok) throw new Error(body.error);
                if (getValues(`travel.${kind}.airportCode`) !== code) return;
                setValue(
                  `travel.${kind}.airport`,
                  airportSchema.parse(body.airport),
                  { shouldValidate: true },
                );
                clearErrors(name);
                await trigger();
              } catch {
                if (getValues(`travel.${kind}.airportCode`) !== code) return;
                setError(name, {
                  message:
                    "Airport could not be resolved. Check its IATA code and retry.",
                });
              }
            },
          })}
        />
        {error && (
          <p className="field-error" id={`${name}-error`} role="alert">
            {error.message}
          </p>
        )}
      </div>
    );
  };
  return (
    <details className="travel-details">
      <summary>
        Travel details <span>Optional</span>
      </summary>
      {(["arrival", "departure"] as const).map((kind) => (
        <fieldset key={kind}>
          <legend>
            {kind === "arrival" ? "Arrival flight" : "Departure flight"}
          </legend>
          <div className="field-row">
            {field(
              `travel.${kind}.number`,
              `${kind === "arrival" ? "Arrival" : "Departure"} flight number`,
              "text",
              9,
            )}
            {field(
              `travel.${kind}.airportCode`,
              `${kind === "arrival" ? "Arrival" : "Departure"} airport (IATA code)`,
              "text",
              3,
            )}
          </div>
          {travel?.[kind]?.airport && (
            <p className="field-hint">
              {travel[kind]!.airport!.name} ({travel[kind]!.airport!.timezone});
              reference data, not live flight information.
            </p>
          )}
          <div className="field-row">
            {field(
              `travel.${kind}.date`,
              `${kind === "arrival" ? "Arrival" : "Departure"} date`,
              "date",
              10,
            )}
            {field(
              `travel.${kind}.time`,
              `${kind === "arrival" ? "Arrival" : "Departure"} time`,
              "time",
              5,
            )}
          </div>
        </fieldset>
      ))}
      <p className="field-hint">
        Flight times are local to the airport. Flight numbers are references,
        not verified schedules or bookings.
      </p>
      <fieldset>
        <legend>Accommodation</legend>
        {field("travel.accommodation.name", "Accommodation name")}
        {field(
          "travel.accommodation.location",
          "Address or location",
          "text",
          400,
        )}
        <div className="field-row">
          {field(
            "travel.accommodation.checkInDate",
            "Check-in date",
            "date",
            10,
          )}
          {field(
            "travel.accommodation.checkInTime",
            "Check-in time",
            "time",
            5,
          )}
        </div>
        <div className="field-row">
          {field(
            "travel.accommodation.checkOutDate",
            "Check-out date",
            "date",
            10,
          )}
          {field(
            "travel.accommodation.checkOutTime",
            "Check-out time",
            "time",
            5,
          )}
        </div>
      </fieldset>
      <p className="field-hint">
        Enter planned check-in/out times, not hotel policy hours. Times are
        destination-local; allow 30 minutes for each. Locations, luggage storage
        and transfers are not verified.
      </p>
    </details>
  );
}
