"use client";

import { Loader2, Save, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { GeneratedItinerary } from "@/lib/ai/itinerary-schema";
import { saveItineraryAction } from "@/lib/actions/trip-actions";
import { Button } from "@/components/ui/button";
import { ItineraryView } from "@/components/trips/itinerary-view";

type ItineraryGeneratorPanelProps = {
  tripId: string;
  currency: string;
  hasSavedItinerary: boolean;
  nextVersion: number;
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
  nextVersion,
}: ItineraryGeneratorPanelProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [error, setError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [preview, setPreview] = useState<GeneratedItinerary>();
  const [model, setModel] = useState<string>();

  async function generatePreview() {
    setIsGenerating(true);
    setError(undefined);
    setSaveError(undefined);

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

    setSaveError(undefined);

    startSaving(async () => {
      try {
        const savedItinerary = await saveItineraryAction(
          tripId,
          preview,
          model,
        );

        router.push(`/trips/${tripId}?version=${savedItinerary.version}`);
      } catch {
        setSaveError("Unable to save this itinerary. Please try again.");
      }
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
            Create an AI preview first. Saving this preview will create version{" "}
            {nextVersion} without changing earlier itinerary versions.
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
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Unsaved preview</p>
              <p className="text-muted-foreground">
                This will become itinerary version {nextVersion}.
              </p>
            </div>
            {model ? (
              <p className="text-xs text-muted-foreground">{model}</p>
            ) : null}
          </div>
          <ItineraryView
            itinerary={preview}
            currency={currency}
            heading="Preview itinerary"
          />
          {saveError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {saveError}
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button type="button" onClick={savePreview} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              {isSaving ? "Saving" : `Save as version ${nextVersion}`}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
