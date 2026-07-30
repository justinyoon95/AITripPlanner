"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import type { GeneratedItinerary } from "@/lib/ai/itinerary-schema";
import { saveItineraryAction } from "@/lib/actions/trip-actions";
import { Button } from "@/components/ui/button";
import { ItineraryView } from "@/components/trips/itinerary-view";

type ItineraryGeneratorPanelProps = {
  tripId: string;
  currency: string;
  hasSavedItinerary: boolean;
};

type ItineraryPreviewResponse =
  | {
      itinerary: GeneratedItinerary;
      model: string;
    }
  | {
      error: string;
    };

export function ItineraryGeneratorPanel({
  tripId,
  currency,
  hasSavedItinerary,
}: ItineraryGeneratorPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<GeneratedItinerary>();
  const [model, setModel] = useState<string>();

  async function generatePreview() {
    setIsGenerating(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/trips/${tripId}/itinerary/preview`, {
        method: "POST",
      });
      const data = (await response.json()) as ItineraryPreviewResponse;

      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : "Unable to generate preview.");
        return;
      }

      setPreview(data.itinerary);
      setModel(data.model);
    } catch {
      setError("Unable to generate preview. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  function savePreview() {
    if (!preview || !model) {
      return;
    }

    startSaving(async () => {
      await saveItineraryAction(tripId, preview, model);
    });
  }

  return (
    <div className="grid gap-6 rounded-lg border border-dashed p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-normal">
            {hasSavedItinerary ? "Generate a new version" : "Generate itinerary"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Create an AI preview first. It will not be saved until you confirm.
          </p>
        </div>
        <Button type="button" onClick={generatePreview} disabled={isGenerating}>
          {isGenerating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4" aria-hidden="true" />
          )}
          {isGenerating ? "Generating" : "Generate preview"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {preview ? (
        <div className="grid gap-5">
          <ItineraryView
            itinerary={preview}
            currency={currency}
            heading="Preview itinerary"
          />
          <div className="flex justify-end">
            <Button type="button" onClick={savePreview} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Save itinerary
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
