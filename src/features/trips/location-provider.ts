import { z } from "zod";
import {
  coordinatesSchema,
  locationProvenanceSchema,
  minimumDurationSchema,
  providerNamespaceSchema,
} from "./location-schema";
import type { TripInput } from "./types";

export const placeCandidateSchema = z
  .strictObject({
    id: z.string().min(1).max(200),
    name: z.string().min(1).max(120),
    aliases: z.array(z.string().min(1).max(120)).max(50),
    cityId: z.string().min(1).max(100),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    kind: z.enum(["poi", "district", "city"]),
    latitude: coordinatesSchema.shape.latitude,
    longitude: coordinatesSchema.shape.longitude,
    provenance: locationProvenanceSchema,
    minimumDuration: minimumDurationSchema.optional(),
  })
  .refine((value) => value.id === value.provenance.recordId);
export type PlaceCandidate = z.infer<typeof placeCandidateSchema>;

// Configure adapters in application code, never from browser/model payloads.
// A future adapter must validate provider responses and maintain trusted local
// evidence for synchronous map/replay checks; no fetching is done during reads.
export interface LocationProvider {
  namespace: z.infer<typeof providerNamespaceSchema>;
  search(name: string, input: TripInput): Promise<readonly unknown[]>;
  reference(recordId: string, datasetVersion: string): unknown;
}

// Offline Wikidata keeps its legacy adapter. No additional provider is enabled.
export const configuredLocationProviders: readonly LocationProvider[] = [];
