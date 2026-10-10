"use client";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { activeVersion } from "@/features/trips/versioning";
import { useTripEditor } from "@/features/trips/use-trip-editor";
import type { TripSession } from "@/features/trips/session-schema";
import { ItineraryView } from "./itinerary-view";
import { TripChat } from "./trip-chat";

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
