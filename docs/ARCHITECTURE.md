# TripPlannerAI architecture

## Scope and boundaries

Phase 1 established the responsive frontend, React Hook Form, Zod contracts, mock generation, and browser previews. Phase 2 added the official OpenAI SDK behind a server-only service and a thin Node Route Handler. Phase 3 adds structured conversational editing and local immutable version history, not new infrastructure. The old Prisma/Auth.js implementation remains in Git history, not this runtime. No auth, Supabase, maps, or database is introduced.

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

The AI wire schema contains overview, assumptions, warnings, budget assessment, ordered days, and activities. Day fields: number/date/title, additionalCosts (accommodation/localTransport/additionalMeals), activities. Activity fields: name/description/category/time/durationMinutes/estimatedCost. All fields are required and bounded. A request-specific schema constrains the exact number of days and pace-based activity count, restricts dates to the requested calendar, and bounds day numbers. The prompt also receives explicit ordered requiredDays and activitiesPerDay. Cross-field date ordering and time-interval validation still run afterward; JSON Schema cannot replace those checks. No dates, durations, or activities are silently rewritten to hide a model error.

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
8. Refused/incomplete output is rejected. Validation enforces exact day count/order, non-overlapping activities ending within the day, and 2/3/4 activities for relaxed/moderate/packed pace. Validly shaped but inconsistent schedules return specific INVALID_AI_DAY_COUNT, INVALID_AI_DATES, INVALID_AI_PACE, or INVALID_AI_TIMING errors instead of conflating every failure with dates/pace. Logs record the safe error code/status, not the rejected provider payload. No automatic paid retry is introduced.
9. Server assigns UUIDs and rounds estimates. Pure arithmetic computes costs and flags over-budget plans.
10. Browser validates, writes the existing `trip-planner:preview:v1:<uuid>` localStorage key, and navigates. Loader revalidates storage. Storage-only retries reuse successful output while the form remains mounted.
11. The guard retains the hash for 20 seconds after success or failure. No automatic paid repair request or silent mock fallback occurs.

## Identity and Phase 3 readiness

New IDs are assigned once on the server and survive JSON storage, refresh, and reopening. React uses day/activity IDs as keys. New full-trip generations create new identities. Future targeted edits must retain unchanged IDs and address entities by ID rather than name/index. Newly added entities get server IDs.

Legacy mock previews without day IDs derive deterministic IDs from trip identity/date; their activity IDs and storage namespace remain unchanged. This is a narrow compatibility adapter, not a database migration.

Phase 3 implements targeted operations and local immutable versions as described below. Authorization and durable history remain future work. No whole-day regeneration is offered: arbitrary chatbot text never mutates state directly.

## Conversational editing contracts

`POST /api/trips/edits/propose` accepts `{ itinerary, baseVersionId, baseRevision, message, scope, context }`. The complete current snapshot is validated using the existing domain schema. `scope` is null (whole itinerary) or `{ dayId, activityId: string | null }`. Context contains at most eight `{ role: user | assistant, content }` messages, each bounded to 1,000 characters; the latest request has the same bound. A stale selected target is rejected before a provider call. The route reads at most 128 KiB, retains the existing body deadline, Origin check, safe error envelope, no-store response, and a namespaced duplicate guard.

The service sends only current trip input/days, selected scope, user request, and bounded recent conversation. It excludes the version list and historical snapshots. Structured Outputs returns an object `{ kind: proposal | clarification, message, operations }`, with a nested union for at most six operations. Clarification requires zero operations; proposals require at least one. The same configurable model, 90-second server deadline, zero SDK retries, and `store: false` apply; edit output is capped at 4,000 tokens. No repair/retry/fallback API call occurs.

Supported operations:

- `replace_activity`: existing `dayId`/`activityId` plus complete activity draft, excluding identity. The existing planned-entry ID is preserved even when the recommended place changes.
- `add_activity`: existing `dayId` plus draft. The server assigns a fresh UUID before creating a domain operation.
- `remove_activity`: existing day/activity IDs.
- `reschedule_activity`: existing IDs, start time and duration; no hidden movement of other entries.
- `update_day_costs`: existing day ID and explicit accommodation/localTransport/additionalMeals estimates. Legacy samples without those estimates cannot use this operation.

The pure engine clones the snapshot, validates targets/scope, rejects multiple operations on one target, prevents ID reuse, and validates one-to-four activities with unique normalized names per affected day. Empty days receive a specific explanation suggesting a relaxed replacement. It sorts only affected days, rejects overlap/end-of-day violations/no-op proposals, rounds estimates, and computes totals using the existing cost helpers. Any invalid operation rejects the whole batch. Accommodation/transport/meals remain unchanged unless declared explicitly; input/root/day IDs and all unrelated fields remain unchanged. Changed AI cost totals update the budget assessment deterministically without pretending prices are verified.

The server returns either `{ kind: clarification, message }` or `{ kind: proposal, message, proposal }`. Proposal fields: server UUID/time/source, base version/revision, canonical SHA-256 fingerprint, scope, normalized operations, deterministic summary, and validated candidate. The UI's before/after view uses a pure diff, not an assistant's informal description. Existing generation contracts and pace counts are unchanged.

## Versioning and client flow

1. The preview loader reads v2 session storage first, or wraps the v1 preview in an initial version (ID = trip UUID). Older data is not deleted. Pending request messages become interrupted; paid calls are never replayed after refresh.
2. Before sending, the client persists the user message and blocks duplicate submissions. If saving fails, no paid call occurs. Successful proposals are fingerprint-checked, reapplied locally, and persisted before display. Provider failures do not produce sample data or change the active snapshot.
3. The user reviews changed activities and cost deltas. Acceptance performs a fresh storage read, confirms proposal/base version/revision/fingerprint, revalidates operations, and compares the complete recomputed candidate. It never trusts a browser-stored candidate without checking it.
4. Acceptance appends an immutable `{ id, parentVersionId, createdAt, summary, itinerary }` snapshot. The proposal UUID becomes the version UUID; acceptance time is separate from proposal time. Summaries are generated from operations, not trusted assistant text. Only after a successful write does React publish the new version.
5. Reject clears the proposal and increments revision. Undo moves to the active version's parent; restore selects any stored version. Both invalidate pending proposals and increment the monotonic revision. Revisiting old content does not resurrect old proposals (ABA protection).
6. New edits after restore branch from the restored parent, keeping all prior snapshots in chronological history. UI shows active version, parent, descriptive summary, timestamps, and restore controls.

The v2 storage key is `trip-planner:session:v2:<trip UUID>`. Sessions contain schemaVersion, tripId, activeVersionId, revision, versions, messages, and nullable pendingProposal. Zod verifies trip identity, immutable input consistency, unique version/message IDs, valid prior parents, and the active pointer. Maximums: 25 snapshots, 100 messages, approximately 2 MiB serialized UTF-16 bytes. Limits reject new work, never silently truncate history. Recovery discards malformed/tampered/stale proposals without discarding valid snapshots; a recovery-write failure still displays the valid saved itinerary with a warning.

Storage transactions re-read expected state before and after asynchronous validation and write before updating React. Web Locks serialize cooperative writers across tabs on supporting browsers; without them this is best-effort optimistic detection, not an atomic database transaction. Storage events abort in-flight editing and revalidate the latest proposals before rendering. Browser storage is untrusted/user-controlled: fingerprints detect consistency, not authenticity or ownership. Future server persistence must perform authorization and revision checks in a real database transaction.

Chat retains bounded local history but only recent relevant messages (excluding failed/interrupted/pending requests, labeled by proposal outcome) go to OpenAI. The current snapshot is always authoritative, including after restore. Raw model messages render as text, not HTML. Users can select a day/activity or use whole-itinerary scope. Chat/history have keyboard-accessible tabs; proposal and error states remain accessible on narrow screens.

Original generated narrative fields are deliberately not rewritten for targeted changes. The current activities and recomputed estimates are authoritative; overview/title/assumption text may describe the original plan. Requests changing trip input, moving entries between days, live bookings, and whole-day regeneration require future contracts rather than hidden scope expansion.

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
- Editing tests: unchanged data/IDs, atomic operations, schedule/scope/capacity/conflict rules, structured output normalization, candidate tampering, stale proposals, undo/restore/branching, history limits, legacy migration, quota errors, cross-tab checks, React review/loading/errors, and refresh recovery.
- Desktop/mobile browser checks: navigation, one/14-day previews, validation, refresh persistence, missing/corrupt preview, missing-key error, layout. No paid calls.
- Lint, strict TypeScript, production build, formatting. Mocked checks do not replace a real configured-provider smoke test before release.

## Roadmap (approval required)

Phase 3.5 extends the existing edit endpoint with conversation-first Structured Outputs: text plus optional proposal and calculation in one server-side call. Presentation/action compatibility, evidence/claim checks, deterministic actions and explicit acceptance remain authoritative; lexical edit authorization and topic reconstruction are not used in the real-provider path. A compatibility adapter emits existing UI response shapes. Optional message/outcome/version metadata preserves bounded chronological context without rewriting old sessions or snapshots. Historical intent-contract tests and deterministic mock examples are retained separately from real-model quality measurement. See [AI reliability design and evaluation](AI_RELIABILITY.md) for contracts, limitations, provenance, sequential evaluations and live-run controls.

Integration refinements validate the envelope first, then handle commentary, calculations and proposals independently. Unsupported commentary assertions are replaced with claim-specific uncertainty; unsafe activity claims reject only the proposal. Invalid calculations cannot erase valid proposals and invalid proposals cannot erase valid calculations. Current sums always use the active snapshot; proposed sums require a recomputed valid candidate. Provider calculation variants require a null amount except for hypothetical additional spending; normalization ignores irrelevant non-hypothetical amounts rather than adding them to costs. Unparsable provider envelopes still fail safely.

Chat can continue while a draft is pending. Optional pending context carries only its ID, base version/revision/fingerprint, scope and at most six operations, not the candidate or version history. The client fully revalidates its stored draft; the server checks its base/fingerprint and rebuilds operations before sending them to the model. Refinements produce complete replacement operations against the active snapshot and supersede the old proposal only after validation and a successful storage write. Questions and failures retain the existing draft; acceptance remains a separate control with unchanged stale/candidate checks. Stored v2 sessions require no migration. Development diagnostics report stage/code only, not inputs, model prose or secrets.

1. Real-provider editing smoke tests and quality evaluation against representative targeted requests; expand only with explicit contracts and regression coverage.
2. Supabase PostgreSQL/Auth: ownership, row-level security, durable version/preview storage and migration.
3. Production readiness: shared rate limits, abuse/spending controls, metrics, secret management, deployment checks.
4. Verified place enrichment and Google Maps as separate integrations.
