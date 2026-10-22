import { z } from "zod";

export const coordinatesSchema = z.strictObject({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
export const providerNamespaceSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,39}$/);
export const referenceUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Reference links must use HTTPS without credentials.");
export const locationProvenanceSchema = z.strictObject({
  provider: providerNamespaceSchema,
  recordId: z.string().min(1).max(200),
  datasetVersion: z.string().min(1).max(80),
  referenceUrl: referenceUrlSchema,
  attribution: z
    .array(
      z.strictObject({
        label: z.string().min(1).max(120),
        url: referenceUrlSchema,
      }),
    )
    .min(1)
    .max(5),
});
// Retain the original record shape without defaults or migration: proposal
// fingerprints and immutable snapshots must not change merely on parsing.
export const activityLocationSchema = z.union([
  z.strictObject({
    status: z.literal("resolved"),
    source: z.literal("wikidata_offline"),
    verification: z.literal("reference_matched"),
    catalogVersion: z.string().max(80),
    placeId: z.string().regex(/^Q\d+$/),
    placeName: z.string().min(1).max(120),
    cityId: z.string().min(1).max(100),
    precision: z.enum(["poi", "district"]),
    coordinates: coordinatesSchema,
  }),
  z
    .strictObject({
      status: z.literal("resolved"),
      source: z.literal("provider_reference"),
      verification: z.literal("reference_matched"),
      placeId: z.string().min(3).max(241),
      placeName: z.string().min(1).max(120),
      cityId: z.string().min(1).max(100),
      precision: z.enum(["poi", "district"]),
      coordinates: coordinatesSchema,
      provenance: locationProvenanceSchema,
    })
    .refine(
      (value) =>
        value.placeId ===
        `${value.provenance.provider}:${value.provenance.recordId}`,
      {
        path: ["placeId"],
        message: "Place identity must match its provider namespace.",
      },
    ),
  z.strictObject({
    status: z.enum(["unresolved", "ambiguous"]),
    source: z.literal("none"),
    reason: z.enum([
      "not_found",
      "ambiguous",
      "wrong_city",
      "invalid_result",
      "provider_unavailable",
    ]),
  }),
]);
export type ActivityLocation = z.infer<typeof activityLocationSchema>;
export const minimumDurationSchema = z.strictObject({
  minutes: z.number().int().positive().max(720),
  basis: z.literal("independent_reference"),
  provenance: locationProvenanceSchema,
});
export type MinimumDuration = z.infer<typeof minimumDurationSchema>;
export const durationSourceSchema = z.enum([
  "ai_estimate",
  "user_provided",
  "unknown",
]);
