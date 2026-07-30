"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { createTripAction } from "@/lib/actions/trip-actions";
import type { TripInput } from "@/lib/validation/trip-input";
import {
  travelStyles,
  parseTripFormInput,
  tripFormSchema,
  type TripFormInput,
} from "@/lib/validation/trip-input";
import { formatTravelStyle } from "@/lib/utils/travel-style";
import { Button } from "@/components/ui/button";

const defaultValues: TripFormInput = {
  destination: "",
  startDate: "",
  endDate: "",
  budget: 1500,
  interestsText: "",
  travelStyle: "RELAXED",
};

type TripFormProps = {
  defaultValues?: TripFormInput;
  submitLabel?: string;
  pendingLabel?: string;
  onSubmitTrip?: (input: TripInput) => Promise<{ error?: string } | void>;
};

export function TripForm({
  defaultValues: initialValues = defaultValues,
  submitLabel = "Save trip",
  pendingLabel = "Saving",
  onSubmitTrip = createTripAction,
}: TripFormProps) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TripFormInput>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: initialValues,
  });

  function onSubmit(values: TripFormInput) {
    setServerError(undefined);

    startTransition(async () => {
      let parsed;

      try {
        parsed = parseTripFormInput(values);
      } catch {
        setServerError("Please fix the highlighted fields and try again.");
        return;
      }

      const result = await onSubmitTrip(parsed);

      if (result?.error) {
        setServerError(result.error);
      }
    });
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit(onSubmit)}>
      {serverError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      ) : null}

      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor="destination">
          Destination
        </label>
        <input
          id="destination"
          className="h-10 rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/20"
          placeholder="Tokyo"
          {...register("destination")}
        />
        <FieldError message={errors.destination?.message} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="startDate">
            Start date
          </label>
          <input
            id="startDate"
            type="date"
            className="h-10 rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/20"
            {...register("startDate")}
          />
          <FieldError message={errors.startDate?.message} />
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="endDate">
            End date
          </label>
          <input
            id="endDate"
            type="date"
            className="h-10 rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/20"
            {...register("endDate")}
          />
          <FieldError message={errors.endDate?.message} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="budget">
            Budget
          </label>
          <input
            id="budget"
            type="number"
            min="1"
            step="1"
            className="h-10 rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/20"
            {...register("budget", { valueAsNumber: true })}
          />
          <FieldError message={errors.budget?.message} />
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="travelStyle">
            Travel style
          </label>
          <select
            id="travelStyle"
            className="h-10 rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/20"
            {...register("travelStyle")}
          >
            {travelStyles.map((style) => (
              <option key={style} value={style}>
                {formatTravelStyle(style)}
              </option>
            ))}
          </select>
          <FieldError message={errors.travelStyle?.message} />
        </div>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor="interestsText">
          Interests
        </label>
        <textarea
          id="interestsText"
          className="min-h-24 rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/20"
          placeholder="food, museums, hiking"
          {...register("interestsText")}
        />
        <p className="text-xs text-muted-foreground">
          Separate interests with commas.
        </p>
        <FieldError message={errors.interestsText?.message} />
      </div>

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        {isPending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-sm text-destructive">{message}</p>;
}
