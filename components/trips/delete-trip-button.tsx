"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";

import { deleteTripAction } from "@/lib/actions/trip-actions";
import { Button } from "@/components/ui/button";

type DeleteTripButtonProps = {
  tripId: string;
};

export function DeleteTripButton({ tripId }: DeleteTripButtonProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="destructive"
      disabled={isPending}
      onClick={() => {
        const confirmed = window.confirm(
          "Delete this trip? This cannot be undone.",
        );

        if (!confirmed) {
          return;
        }

        startTransition(async () => {
          await deleteTripAction(tripId);
        });
      }}
    >
      <Trash2 className="size-4" aria-hidden="true" />
      Delete
    </Button>
  );
}
