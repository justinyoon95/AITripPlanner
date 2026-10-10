# TripPlannerAI architecture

## Scope and boundaries

Phase 1 established the responsive frontend, React Hook Form, Zod contracts, mock generation, and browser previews. Phase 2 adds the official OpenAI SDK behind a server-only service and a thin Node Route Handler. The old Prisma/Auth.js implementation remains in Git history, not this runtime. No auth, Supabase, maps, chatbot, or new persistence infrastructure is introduced.

Routes/static content are server components. Form and preview loader are client components. Domain schemas, formatting, and arithmetic are provider-independent. `src/lib/ai` owns SDK/configuration, prompts, wire schema, normalization, safe errors, and request controls. `server-only` prevents accidental SDK/key inclusion in client imports. Vitest aliases only this marker because tests run outside Next's server loader.

## Request and response contracts

`POST /api/trips/generate` accepts JSON matching shared `tripInputSchema`:

```json
{
  "destination": "Kyoto, Japan",
  "startDate": "2026-12-01",
  "endDate": "2026-12-03",
  "budget": 1500,
  "currency": "USD",
  "interests": ["Food", "Culture"],
  "pace": "moderate",
  "preferences": "Vegetarian meals"
}
```

Destination/notes are trimmed, bounded to 100/1,000 characters. Budget is positive, finite, at most 1 billion, with at most two decimals. Currency/interests/pace are enumerated. Unknown input fields and duplicate interests are rejected. Dates must be real calendar dates, ordered, and 1-14 inclusive days apart. RHF and API use the same schema; UTC date arithmetic avoids DST problems.

The AI wire schema contains overview, assumptions, warnings, budget assessment, ordered days, and activities. Day fields: number/date/title, additionalCosts (accommodation/localTransport/additionalMeals), activities. Activity fields: name/description/category/time/durationMinutes/estimatedCost. All fields are required and bounded. Custom cross-field validation runs afterward rather than being included in the provider JSON schema.

The domain itinerary adds UUID `id`, `createdAt`, `source: ai | mock`, input snapshot, and stable IDs for every day/activity. AI itineraries must include overview, budget assessment, and additional costs; older mocks may omit these. Assumptions/warnings default to empty arrays. The model does not control identity or totals.

Success: `{ itinerary: Itinerary }`. Error: `{ error: { code, message, fieldErrors? } }`. Invalid input returns 400, duplicate request 429/Retry-After, configuration 503, upstream failures 502/503, generation timeout 504, refusal 422. Body size/content type errors return 413/415. Responses are no-store. Browser code validates responses before persistence.

## Data flow

1. Form validates and enters loading state; an in-flight ref prevents duplicate work.
2. Browser posts JSON with an abort signal and 110-second deadline.
3. Route checks Origin when supplied, reads at most 32 KiB within 10 seconds, and validates the shared schema.
4. A canonical SHA-256 hash (sorting interests) acquires a bounded process-local guard.
5. Service validates again, selects explicit development mock or real AI mode, and checks server credentials.
6. Official SDK `responses.parse` uses `zodTextFormat`, configurable model, 90-second deadline, duration allowance, `store: false`, and zero retries.
7. Prompt treats input as untrusted preferences and forbids invented verification of prices/hours/availability/routes or dietary/accessibility suitability.
8. Refused/incomplete output is rejected. Validation enforces exact day count/order, non-overlapping activities ending within the day, and 2/3/4 activities for relaxed/moderate/packed pace.
9. Server assigns UUIDs and rounds estimates. Pure arithmetic computes costs and flags over-budget plans.
10. Browser validates, writes the existing `trip-planner:preview:v1:<uuid>` localStorage key, and navigates. Loader revalidates storage. Storage-only retries reuse successful output while the form remains mounted.
11. The guard retains the hash for 20 seconds after success or failure. No automatic paid repair request or silent mock fallback occurs.

## Identity and Phase 3 readiness

New IDs are assigned once on the server and survive JSON storage, refresh, and reopening. React uses day/activity IDs as keys. New full-trip generations create new identities. Future targeted edits must retain unchanged IDs and address entities by ID rather than name/index. Newly added entities get server IDs.

Legacy mock previews without day IDs derive deterministic IDs from trip identity/date; their activity IDs and storage namespace remain unchanged. This is a narrow compatibility adapter, not a database migration.

**Not implemented yet:** immutable versions, patch operations, conversation state, authorization, and durable history. Phase 3 should define replace/add/remove activity and regenerate-day operations, expected-version checks, full-itinerary validation after patches, and append-only versions preserving unaffected IDs. Do not mutate state directly from arbitrary chatbot text.

## Budget and reliability tradeoffs

Estimate scope is one traveler at the destination: activities, accommodation nights before departure, local transport, and meals not counted as activities. Travel to/from destination is excluded. Code validates arithmetic, not factual accuracy. Honest over-budget/uncertain plans are preferable to fabricated prices. Currency amounts are approximate major-unit numbers, rounded to two decimals.

`min(12000, 1000 + 850 * days)` bounds output while allowing longer schedules. Insufficient allowance yields an explicit error, not partial storage. Expanding the shared 14-day constraint requires revisiting wire/domain bounds, prompt, token cap, deadlines, and performance tests.

Guard capacity is 200 entries, with 120-second in-flight expiry exceeding the provider deadline. It only protects accidental equivalent requests, not quotas: independent serverless instances, distinct payloads, and same-input user collisions limit it. Public production deployment requires durable rate limits, abuse/concurrency protection, provider spending controls, and metrics. Origin checks do not stop direct clients.

Preview persistence remains local and untrusted, not shareable/durable. Frontend validation is UX; backend validation is the trust boundary. UI discloses OpenAI input transfer. Server logs never include keys, raw prompts, or provider payloads. `store: false` is not zero retention.

## Verification

- Domain tests: dates/duration, input bounds, rounding/totals, schedule validation, identity, legacy storage.
- Service tests: mocked SDK, strict Structured Outputs, model/token settings, normalization, missing keys, invalid/refused/incomplete outputs, provider errors/timeouts/cancellation, mock production prohibition.
- Route/control tests: malformed/oversized/stalled bodies, invalid inputs, Origin/content type, duplicate canonical requests, expiry/capacity, no-store and sanitized errors.
- Client/React tests: HTTP envelopes, network/abort failures, invalid responses, no fallback, loading, duplicate submits, errors/retry, storage-only retry, frontend date constraints.
- Desktop/mobile browser checks: navigation, one/14-day previews, validation, refresh persistence, missing/corrupt preview, missing-key error, layout. No paid calls.
- Lint, strict TypeScript, production build, formatting. Mocked checks do not replace a real configured-provider smoke test before release.

## Roadmap (approval required)

1. Typed targeted edit proposals, apply/validate operations, immutable versions/concurrency tests; then a conversational UI.
2. Supabase PostgreSQL/Auth: ownership, row-level security, durable version/preview storage and migration.
3. Production readiness: shared rate limits, abuse/spending controls, metrics, secret management, deployment checks.
4. Verified place enrichment and Google Maps as separate integrations.
