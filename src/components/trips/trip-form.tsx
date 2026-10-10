"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  MapPin,
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
  tripInputSchema,
} from "@/features/trips/schema";
import { generateMockItinerary } from "@/features/trips/mock-generator";
import { storePreview } from "@/features/trips/storage";
import type { TripInput } from "@/features/trips/types";

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

export function TripForm({ destination = "" }: { destination?: string }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isNavigating, startNavigation] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TripInput>({
    resolver: zodResolver(tripInputSchema),
    defaultValues: {
      destination,
      startDate: "",
      endDate: "",
      currency: "USD",
      interests: [],
      pace: "moderate",
      preferences: "",
    },
    shouldFocusError: true,
  });
  const startDate = useWatch({ control, name: "startDate" });
  async function submit(values: TripInput) {
    setSubmitError(null);
    try {
      const itinerary = generateMockItinerary(values, crypto.randomUUID());
      storePreview(itinerary);
      startNavigation(() => router.push(`/trips/${itinerary.id}`));
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "We couldn't create your preview. Please try again.",
      );
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
    <form onSubmit={handleSubmit(submit)} noValidate className="trip-form">
      <div className="form-section">
        <div className="form-section-title">
          <span>01</span>
          <h2>The essentials</h2>
        </div>
        <div className="field">
          <label htmlFor="destination">Where are you headed?</label>
          <div className="input-icon">
            <MapPin size={18} />
            <input
              id="destination"
              placeholder="City or region, e.g. Kyoto, Japan"
              autoComplete="off"
              maxLength={100}
              {...register("destination")}
              {...accessibility("destination")}
            />
          </div>
          {error("destination")}
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="startDate">Start date</label>
            <input
              id="startDate"
              type="date"
              {...register("startDate")}
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
              {...register("endDate")}
              {...accessibility("endDate")}
            />
            {error("endDate")}
          </div>
        </div>
        <p className="field-hint">
          Up to {MAX_TRIP_DAYS} days, including your arrival and departure days.
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
          <p className="field-hint">Choose everything that sounds like you.</p>
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
            Your notes stay with the preview. Sample activities do not yet adapt
            to free-text requests.
          </p>
        </div>
      </div>
      {submitError && (
        <p className="error-box" role="alert">
          {submitError}
        </p>
      )}
      <div className="form-bottom">
        <p>
          A sample plan to start exploring.
          <br />
          <span>No bookings. No commitments.</span>
        </p>
        <Button type="submit" disabled={isSubmitting || isNavigating}>
          {isSubmitting || isNavigating ? (
            <>
              <LoaderCircle size={18} className="spin" />
              Creating preview...
            </>
          ) : (
            <>
              Preview my itinerary <ArrowRight size={18} />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
