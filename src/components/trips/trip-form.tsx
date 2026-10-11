"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  useForm,
  useWatch,
  Controller,
  FormProvider,
  type FieldPath,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  LoaderCircle,
  Check,
  Coffee,
  Footprints,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CURRENCIES,
  INTERESTS,
  MAX_TRIP_DAYS,
  newTripSchema,
} from "@/features/trips/schema";
import { requestItinerary } from "@/features/trips/generate-client";
import { latestEndDate, dateSchema } from "@/features/trips/calendar";
import {
  destinationSchema,
  MAX_TRAVELERS,
} from "@/features/trips/planning-schema";
import { DestinationCombobox } from "./destination-combobox";
import { TravelDetails } from "./travel-details";
import { useLocalCalendar } from "./use-local-calendar";
import { storePreview } from "@/features/trips/storage";
import { canonicalJSON } from "@/features/trips/fingerprint";
import type { Itinerary, TripInput } from "@/features/trips/types";

const paceOptions = [
  {
    value: "relaxed",
    label: "Relaxed",
    description: "Room to wander",
    icon: Coffee,
  },
  {
    value: "moderate",
    label: "Moderate",
    description: "A little of everything",
    icon: Footprints,
  },
  {
    value: "packed",
    label: "Packed",
    description: "Make every hour count",
    icon: Zap,
  },
] as const;

export function TripForm({
  destination = "",
  mockMode = false,
}: {
  destination?: string;
  mockMode?: boolean;
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isNavigating, startNavigation] = useTransition();
  const inFlight = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const pendingPreview = useRef<{ input: string; itinerary: Itinerary } | null>(
    null,
  );
  useEffect(() => () => abort.current?.abort(), []);
  const form = useForm<TripInput>({
    resolver: zodResolver(newTripSchema()),
    mode: "onChange",
    defaultValues: {
      destination,
      startDate: "",
      endDate: "",
      currency: "USD",
      interests: [],
      pace: "moderate",
      preferences: "",
      travelers: 1,
      seasonalPreference: "include",
    },
    shouldFocusError: true,
  });
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    clearErrors,
    getValues,
    formState: { errors, isSubmitting },
  } = form;
  const { today, timezone } = useLocalCalendar();
  useEffect(() => {
    if (timezone) setValue("timezone", timezone);
  }, [setValue, timezone]);
  const startDate = useWatch({ control, name: "startDate" });
  const selectedCity = useWatch({ control, name: "resolvedDestination" });
  async function submit(values: TripInput) {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsGenerating(true);
    setSubmitError(null);
    try {
      abort.current = new AbortController();
      if (!values.resolvedDestination) {
        const response = await fetch(
          `/api/destinations?q=${encodeURIComponent(values.destination)}&resolve=yes`,
          { signal: abort.current?.signal },
        );
        const body = await response.json();
        if (!response.ok) {
          setError("destination", {
            message: body.error ?? "Select a recognized city.",
          });
          return;
        }
        values.resolvedDestination = destinationSchema.parse(body.destination);
        setValue("resolvedDestination", values.resolvedDestination);
      }
      const inputKey = canonicalJSON(values);
      const itinerary =
        pendingPreview.current?.input === inputKey
          ? pendingPreview.current.itinerary
          : await requestItinerary(values, abort.current.signal);
      pendingPreview.current = { input: inputKey, itinerary };
      storePreview(itinerary);
      startNavigation(() => router.push(`/trips/${itinerary.id}`));
    } catch (error) {
      if (error instanceof Error && "fieldErrors" in error)
        for (const [field, messages] of Object.entries(
          error.fieldErrors as Record<string, string[]>,
        ))
          setError(field as FieldPath<TripInput>, { message: messages[0] });
      setSubmitError(
        error instanceof Error
          ? error.message
          : "We couldn't create your preview. Please try again.",
      );
    } finally {
      inFlight.current = false;
      setIsGenerating(false);
    }
  }
  const error = (name: keyof TripInput) =>
    errors[name] ? (
      <p id={`${name}-error`} className="field-error" role="alert">
        {errors[name]?.message}
      </p>
    ) : null;
  const accessibility = (name: keyof TripInput) => ({
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(event) => {
          void handleSubmit(submit)(event);
        }}
        noValidate
        className="trip-form"
        aria-busy={isSubmitting || isGenerating || isNavigating}
      >
        <div className="form-section">
          <div className="form-section-title">
            <span>01</span>
            <h2>The essentials</h2>
          </div>
          <div className="field">
            <label htmlFor="destination">Where are you headed?</label>
            <Controller
              control={control}
              name="destination"
              render={({ field }) => (
                <DestinationCombobox
                  inputRef={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  selected={selectedCity}
                  onChange={(value) => {
                    field.onChange(value);
                    setValue("resolvedDestination", undefined);
                  }}
                  onSelect={(city) => {
                    field.onChange(
                      [city.name, city.region, city.country]
                        .filter(Boolean)
                        .join(", "),
                    );
                    setValue("resolvedDestination", city, {
                      shouldValidate: true,
                    });
                    clearErrors("destination");
                  }}
                  invalid={!!errors.destination}
                  describedBy={
                    errors.destination ? "destination-error" : undefined
                  }
                />
              )}
            />
            {error("destination")}
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="startDate">Start date</label>
              <input
                id="startDate"
                type="date"
                min={today || undefined}
                max="9999-12-31"
                maxLength={10}
                {...register("startDate", {
                  onChange: (event) => {
                    const start = event.target.value;
                    const end = getValues("endDate");
                    if (
                      dateSchema.safeParse(start).success &&
                      end &&
                      (end < start || end > latestEndDate(start))
                    ) {
                      setValue("endDate", "", { shouldValidate: true });
                      setError("endDate", {
                        message:
                          "Choose a new end date within 14 days of the start.",
                      });
                    }
                  },
                })}
                {...accessibility("startDate")}
              />
              {error("startDate")}
            </div>
            <div className="field">
              <label htmlFor="endDate">End date</label>
              <input
                id="endDate"
                type="date"
                min={startDate || undefined}
                max={
                  dateSchema.safeParse(startDate).success
                    ? latestEndDate(startDate)
                    : "9999-12-31"
                }
                maxLength={10}
                {...register("endDate")}
                {...accessibility("endDate")}
              />
              {error("endDate")}
            </div>
          </div>
          <p className="field-hint">
            Up to {MAX_TRIP_DAYS} days, including your arrival and departure
            days. Budget estimates cover your whole party, excluding travel to
            and from your destination.
          </p>
          <div className="budget-row">
            <div className="field">
              <label htmlFor="budget">Total trip budget</label>
              <input
                id="budget"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="1,500"
                inputMode="decimal"
                {...register("budget", { valueAsNumber: true })}
                {...accessibility("budget")}
              />
              {error("budget")}
            </div>
            <div className="field">
              <label htmlFor="currency">Currency</label>
              <select
                id="currency"
                {...register("currency")}
                {...accessibility("currency")}
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
              {error("currency")}
            </div>
          </div>
          <div className="field">
            <label htmlFor="travelers">Travelers</label>
            <input
              id="travelers"
              type="number"
              min={1}
              max={MAX_TRAVELERS}
              step={1}
              {...register("travelers", { valueAsNumber: true })}
              {...accessibility("travelers")}
            />
            {error("travelers")}
          </div>
        </div>
        <div className="form-section">
          <div className="form-section-title">
            <span>02</span>
            <h2>Your kind of adventure</h2>
          </div>
          <fieldset
            aria-describedby={errors.interests ? "interests-error" : undefined}
          >
            <legend>What do you love doing?</legend>
            <p className="field-hint">
              Choose everything that sounds like you.
            </p>
            <div className="interest-options">
              {INTERESTS.map((interest) => (
                <label key={interest} className="interest-option">
                  <input
                    type="checkbox"
                    value={interest}
                    {...register("interests")}
                  />
                  <span>
                    <Check size={14} />
                    {interest}
                  </span>
                </label>
              ))}
            </div>
            {error("interests")}
          </fieldset>
          <fieldset aria-describedby={errors.pace ? "pace-error" : undefined}>
            <legend>Set your travel pace</legend>
            <div className="pace-options">
              {paceOptions.map(({ value, label, description, icon: Icon }) => (
                <label key={value} className="pace-option">
                  <input type="radio" value={value} {...register("pace")} />
                  <span>
                    <Icon size={21} strokeWidth={1.5} />
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </label>
              ))}
            </div>
            {error("pace")}
          </fieldset>
        </div>
        <div className="form-section">
          <div className="form-section-title">
            <span>03</span>
            <h2>The little details</h2>
            <span className="optional">Optional</span>
          </div>
          <div className="field">
            <label htmlFor="seasonalPreference">
              Seasonal experiences and local events
            </label>
            <select id="seasonalPreference" {...register("seasonalPreference")}>
              <option value="include">Include when relevant</option>
              <option value="prioritize">
                Prioritize seasonal experiences
              </option>
              <option value="exclude">
                Do not specifically include seasonal experiences
              </option>
            </select>
            {error("seasonalPreference")}
          </div>
          <div className="field">
            <label htmlFor="preferences">Anything else on your mind?</label>
            <textarea
              id="preferences"
              rows={4}
              maxLength={1000}
              placeholder="Dietary needs, accessibility preferences, a must-see spot..."
              {...register("preferences")}
              {...accessibility("preferences")}
            />
            {error("preferences")}
            <p className="field-hint">
              Include dietary needs, accessibility preferences, or must-see
              places. Recommendations still need verification.
            </p>
          </div>
        </div>
        <TravelDetails />
        {submitError && (
          <p className="error-box" role="alert">
            {submitError}
          </p>
        )}
        <p className="field-hint">
          {mockMode
            ? "Development preview: illustrative sample activities, not AI-generated recommendations."
            : "Trip details are sent to OpenAI to generate your plan. Avoid entering sensitive personal information."}
        </p>
        <div className="form-bottom">
          <p>
            A personalized plan to start exploring.
            <br />
            <span>No bookings. No commitments.</span>
          </p>
          <Button
            type="submit"
            disabled={
              isSubmitting ||
              isGenerating ||
              isNavigating ||
              Object.keys(errors).length > 0
            }
          >
            {isSubmitting || isGenerating || isNavigating ? (
              <>
                <LoaderCircle size={18} className="spin" />
                Generating your itinerary...
              </>
            ) : (
              <>
                Preview my itinerary <ArrowRight size={18} />
              </>
            )}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
