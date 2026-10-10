import { z } from "zod";
import { itinerarySchema } from "./schema";

export const generationSuccessSchema = z.object({ itinerary: itinerarySchema });
export const generationErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
