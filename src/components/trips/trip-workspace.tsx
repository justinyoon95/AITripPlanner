"use client";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { activeVersion } from "@/features/trips/versioning";
import { useTripEditor } from "@/features/trips/use-trip-editor";
import type { TripSession } from "@/features/trips/session-schema";
import { ItineraryView } from "./itinerary-view";
import { TripChat } from "./trip-chat";
import { useCallback, useState } from "react";
import { ItineraryMap } from "./itinerary-map";

export function TripWorkspace({
  initial,
  mockMode,
  initialWarning,
}: {
  initial: TripSession;
  mockMode: boolean;
  initialWarning?: string;
}) {
  const editor = useTripEditor(initial, initialWarning);
  const version = activeVersion(editor.session);
  const [mapDay, setMapDay] = useState(version.itinerary.days[0].id);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedActivity = version.itinerary.days
    .flatMap((d) => d.activities)
    .some((a) => a.id === selected)
    ? selected
    : null;
  const selectFromMap = useCallback(
    (id: string) => {
      setSelected(id);
      if (document.querySelector("dialog[open]")) return;
      document.getElementById(`activity-${id}`)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "center",
      });
    },
    [setSelected],
  );
  return (
    <>
      <div className="workspace-toolbar">
        <span>
          Version{" "}
          {editor.session.versions.findIndex((item) => item.id === version.id) +
            1}{" "}
          <small>· Active</small>
        </span>
        <Button
          variant="ghost"
          disabled={Boolean(editor.busy) || version.parentVersionId === null}
          onClick={() => void editor.undo()}
          title="Restore the parent version"
        >
          <Undo2 size={16} />
          Undo
        </Button>
      </div>
      <ItineraryView
        itinerary={version.itinerary}
        selectedActivityId={selectedActivity}
        map={
          <ItineraryMap
            itinerary={version.itinerary}
            dayId={mapDay}
            selectedActivityId={selectedActivity}
            onDayChange={(id) => {
              setMapDay(id);
              setSelected(null);
            }}
            onSelectActivity={selectFromMap}
          />
        }
        onLocateActivity={(dayId, id) => {
          setMapDay(dayId);
          setSelected(id);
          document.getElementById("itinerary-map")?.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "instant"
              : "smooth",
            block: "start",
          });
        }}
        editor={<TripChat editor={editor} mockMode={mockMode} />}
        onEditActivity={(dayId, activityId) => {
          if (!editor.busy && !editor.session.pendingProposal) {
            editor.setScope({ dayId, activityId });
            document
              .getElementById("trip-editor")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }}
        editDisabled={Boolean(editor.busy || editor.session.pendingProposal)}
      />
    </>
  );
}
