import { zodTextFormat } from "openai/helpers/zod";

import { buildItineraryPrompt } from "@/lib/ai/itinerary-prompts";
import {
  generatedItinerarySchema,
  validateGeneratedItineraryForTrip,
} from "@/lib/ai/itinerary-schema";
import { getItineraryModel, getOpenAIClient } from "@/lib/ai/openai-client";

type TripForGeneration = Parameters<typeof buildItineraryPrompt>[0];

export async function generateItineraryForTrip(trip: TripForGeneration) {
  const client = getOpenAIClient();
  const model = getItineraryModel();

  const response = await client.responses.create({
    model,
    instructions:
      "You are a careful travel-planning assistant. Return only valid structured itinerary data that matches the requested schema.",
    input: buildItineraryPrompt(trip),
    text: {
      format: zodTextFormat(generatedItinerarySchema, "trip_itinerary"),
    },
  });

  const parsed = generatedItinerarySchema.parse(JSON.parse(response.output_text));

  return {
    itinerary: validateGeneratedItineraryForTrip(parsed, trip),
    model,
  };
}
