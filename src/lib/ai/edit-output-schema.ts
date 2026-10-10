import { z } from "zod";
import {
  activityDraftSchema,
  editOperationSchema,
  MAX_EDIT_OPERATIONS,
} from "@/features/trips/edit-schema";

// Provider-generated additions have no identity; normalization assigns UUIDs.
const wireOperation = z.union([
  editOperationSchema.options[0],
  editOperationSchema.options[1],
  editOperationSchema.options[2],
  z.strictObject({
    type: z.literal("add_activity"),
    dayId: z.string().min(1).max(200),
    activity: activityDraftSchema,
  }),
  editOperationSchema.options[4],
]);
export const aiEditOutputSchema = z.strictObject({
  kind: z.enum(["proposal", "clarification"]),
  message: z.string().min(1).max(1000),
  operations: z.array(wireOperation).max(MAX_EDIT_OPERATIONS),
});
export type AIEditOutput = z.infer<typeof aiEditOutputSchema>;
