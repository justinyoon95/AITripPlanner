<div align="center">

<h1>TripPlannerAI</h1>

<p><strong>Plan smarter. Explore further.</strong></p>

<p>Personalized AI itineraries, conversational editing, and travel-budget estimates with browser-local version history.</p>

<p>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-18181B?style=flat-square" alt="Next.js" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-087EA4?style=flat-square" alt="React" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind_CSS-0E7490?style=flat-square" alt="Tailwind CSS" /></a>
  <a href="https://zod.dev/"><img src="https://img.shields.io/badge/Zod-365A9C?style=flat-square" alt="Zod" /></a>
  <a href="https://platform.openai.com/"><img src="https://img.shields.io/badge/OpenAI-166534?style=flat-square" alt="OpenAI" /></a>
</p>

</div>

## Overview

A travel planner with personalized AI itineraries, conversational editing, deterministic budget estimates, and browser-local version history.

## Features

- Personalized day-by-day plans based on validated destinations, dates, budget, interests, pace, and seasonal preferences.
- Optional flights and accommodation, with separate hotel policy times and planned movements, plus flight-aware scheduling constraints.
- Natural travel conversation and targeted itinerary proposals with explicit before/after review and accept/reject controls.
- Server-calculated whole-party and per-person estimates, budget comparisons, and highest-cost-day answers.
- Immutable itinerary versions, undo/restore, and browser-local persistence.
- City-specific Unsplash photography and an expandable MapLibre destination map, with a default photograph and credential-free offline map fallback.

Built with Next.js App Router, React, TypeScript, Tailwind CSS, React Hook Form, Zod, and the official OpenAI SDK. Authentication and cloud persistence are not implemented.

## Getting started

Use Node.js 22.13+ or a current supported LTS release.

```sh
npm ci
```

Copy the committed configuration template to a private local file:

```sh
cp .env.example .env.local
```

The template defaults to development sample mode, which needs no OpenAI credentials. For real generation and chat, configure:

```dotenv
OPENAI_API_KEY=your_private_project_api_key
OPENAI_MODEL=gpt-4.1-mini
TRIP_GENERATION_MODE=ai
```

Create a project key in the [OpenAI dashboard](https://platform.openai.com/api-keys) and configure API billing/credits and usage alerts for your account. ChatGPT subscriptions do not configure this application's API access. Never paste keys into browser code, screenshots, or GitHub; do not use a `NEXT_PUBLIC_` prefix. Restart the server after environment changes.

Optional visual providers use the remaining variables in `.env.example`:

| Variable                     | Purpose                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DESTINATION_PHOTOS_ENABLED` | Set to `true` to enable city-photo requests; defaults to `false`.                                                       |
| `UNSPLASH_ACCESS_KEY`        | Server-only Unsplash application access key.                                                                            |
| `NEXT_PUBLIC_MAPTILER_KEY`   | Browser-visible MapTiler key for detailed maps; restrict allowed domains. Leave blank for the bundled offline overview. |

Register provider applications and review their quotas and billing before enabling them. Unsplash images are hotlinked with photographer attribution and usage tracking. Missing configuration or provider failures do not prevent trip creation. No external credentials are needed for development sample itineraries with the default photograph and offline map.

```sh
npm run dev
```

Open the printed localhost URL and visit `/trips/new`. Start with a one-day trip and submit once. A successful response opens `/trips/<preview-id>`; refresh to check persistence. Costs are estimates, not verified prices or bookings.

### Test conversational editing

The editor uses the same private key, model, and mode as trip generation. With `TRIP_GENERATION_MODE=ai`, restart using `npm run dev` (stop any server launched with a shell-level `mock` override first).

1. Generate a short real itinerary or reopen an existing local preview.
2. Use a day's/activity's chat icon to select the intended target, or leave the focus on the whole itinerary.
3. Request "Replace the museum on Day 2 with shopping" or "Make Day 2 less busy". For a one-day trip, select an activity and request a cheaper alternative.
4. Review the explicit before/after activities and estimated cost change. Nothing changes until **Accept changes**. **Reject** leaves the itinerary unchanged.
5. Refresh to verify persistence. Use **Undo** or **History → Restore version** to revisit earlier snapshots. History shows descriptions, creation times, parent versions, and the active version.
6. Request removal of an ordinary day's last activity to check the one-activity minimum; request a conflicting time to check schedule validation. Flight-constrained logistics-only days may remain empty. Invalid proposals explain the issue, not silently fix unrelated activities.
7. Keep a draft open and ask "Make it flexible" or an informational question. Refinement replaces the draft; questions keep it available. Saying "Yes" in chat never accepts changes.

One proposal request may incur API charges. Accept/reject/undo/restore are local and make no OpenAI calls. Automated tests and sample-mode browser checks do not confirm real-provider availability or recommendation quality. Verify a real edit with your configured account before release.

### Free development previews

```sh
TRIP_GENERATION_MODE=mock npm run dev
```

This explicitly exercises the API, form, editor, and storage with labeled illustrative data, without keys or paid calls. Sample editing supports naming a day and requesting "less busy", selecting an activity and requesting "cheaper" or "shopping", and empty-day explanations; it is not an offline language model. Mock mode is rejected in production. AI errors never silently fall back to sample data. Restore `ai` mode for real generation/editing.

## Checks

Ordinary tests mock provider requests and never run paid evaluations. The opt-in `npm run eval:live` runner refuses paid OpenAI calls without `AI_EVAL_ALLOW_PAID=yes`; it also requires AI mode, credentials, and its configured cost controls. Generated reports are ignored. Conversation quality remains model-dependent; mocked tests are not real-model accuracy measurements.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
```

Tests cover input/output contracts, IDs, arithmetic, hotel policy and movement semantics, storage compatibility, provider errors/timeouts, request controls, React loading/error behavior, targeted edits, conflicting operations, stale/tampered proposals, immutable versions, undo/restore, cross-tab changes, and failed storage writes.

<details>
<summary>Code organization and data flow</summary>

```text
src/
  app/                       Server pages and route-level states
    api/trips/generate/      POST handler: validation, request controls, safe errors
    api/trips/edits/propose/ POST handler: targeted edit proposals
  components/
    ui/                      Shared controls
    trips/                   Form, preview loader, itinerary view, chat, diff, history
  features/trips/
    schema.ts, types.ts      Shared domain validation and inferred types
    generation-contract.ts  API success/error envelopes
    generate-client.ts      Browser HTTP client and response validation
    costs.ts, format.ts      Pure arithmetic and formatting
    mock-data.ts             Illustrative activity templates
    mock-generator.ts        Explicit development/test generation
    storage.ts               Browser persistence and legacy compatibility
    edit-schema.ts           Shared requests, operations, proposals, scopes
    edit-engine.ts           Pure targeted edits and deterministic validation
    edit-diff.ts             Before/after review data
    fingerprint.ts           Canonical SHA-256 snapshot identity
    versioning.ts            Proposal checks, immutable versions, undo/restore
    session-schema.ts        Bounded version/conversation state
    session-storage.ts       v2 storage, recovery, optimistic cross-tab transactions
    edit-client.ts           Browser edit HTTP client
    use-trip-editor.ts       Client workflow and persistence orchestration
  lib/ai/                    Server-only SDK, configuration, prompts, wire schema,
                             normalization, body limits, duplicate guard, errors
tests/                       Domain, service, route, storage, and UI tests
docs/                        Technical reference and verification records
```

RHF and the backend share one Zod request schema. The provider wire schema excludes IDs and totals: the server assigns UUIDs and validates schedules; pure code computes costs. The UI renders the domain contract, not provider-specific data.

</details>

## Current limitations

- Recommendations, prices, venue details, attraction durations, and routing are not externally verified. Costs are whole-party estimates, not booking quotes.
- Flight and hotel details are user-supplied. Airport/transfer buffers are estimates; hotel policies are distinct from actual planned movements.
- Trips and versions are local to the browser and origin. There are no accounts, cloud synchronization, or shareable saved trips.
- Natural-language understanding is model-dependent. Only validated proposals accepted through the review controls change an itinerary.
- The process-local request guard is not durable rate limiting or a distributed spending quota. Paid endpoints are not protected for unrestricted public use.

<details>
<summary>Validation, cost controls, and storage guarantees</summary>

- Maximum 14 inclusive days; new trips start today or later in the validated user calendar timezone. Historical trips remain viewable.
- Default `gpt-4.1-mini` supports [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). A replacement model must support Responses/Structured Outputs and be tested for cost/quality.
- Output allowance: `min(12000, 1000 + 850 * inclusiveDays)`: 1,850 tokens for one day, 3,550 for three, 12,000 at the cap. This bounds output, not exact price or completion. Input tokens are also billable; consult [model pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
- Server timeout: 90 seconds; browser timeout: 110 seconds; SDK retries: zero. Incomplete output is rejected. Cancellation/timeouts do not guarantee provider billing stops.
- Request bodies: 32 KiB maximum, 10-second read timeout. Dates, lengths, activity ordering/non-overlap, pace, unique IDs, and nonnegative costs are validated.
- Edit bodies: 128 KiB maximum; messages ≤1,000 characters; at most eight recent context messages (each ≤1,000 characters), six operations, and 4,000 output tokens. Only current input/days and recent messages are sent, never all version snapshots. Complex/ambiguous requests receive clarification or an actionable error, with no automatic paid repair.
- Ordinary generation keeps its 2/3/4 pace-based activity count; constrained travel days have reduced counts, with zero activities only when a flight boundary has no safe known window. Editing allows one to four activities on ordinary days and enforces the same flight/hotel windows. Changes are all-or-nothing and may not overlap or cross midnight. Cost totals are recomputed in code, never trusted from the model.
- Form blocks duplicate submits. A bounded process-local guard rejects identical requests while running and for 20 seconds after success/failure. Storage-only retry reuses a successful result while the form stays mounted.
- The process-local request guard is not durable rate limiting or a distributed spending quota. Serverless instances have independent maps; different inputs bypass the guard; identical users may briefly collide. Origin checks are not authentication. Paid endpoints are not protected for unrestricted public use.
- Costs estimate the whole party (1-10 travelers, default one; legacy trips retain one-traveler meaning): activities, accommodation, local transport and additional meals not already included in activities. Travel to/from the destination is excluded. Totals are computed and over-budget plans flagged without artificially lowering prices. All recommendations need verification.
- Major-unit amounts rounded to two decimals are approximations, not a financial ledger or currency conversion engine.
- Inputs go to OpenAI; `store: false` disables Responses storage, not all provider retention. Avoid sensitive preferences. Logs contain only safe error codes/statuses, not keys, prompts, or provider payloads.
- Preview links and version history are local to the browser/origin. Clearing site data removes them; they are not shareable or durable. Legacy previews gain deterministic day IDs and an initial version, without deleting old data. Sessions are capped at 25 snapshots, 100 chat messages, and approximately 2 MiB serialized UTF-16 size; limits are explicit, with no silent pruning. A failed write does not publish an accepted change.
- Pending proposals are revalidated on receipt, recovery, and acceptance against the active version, monotonic revision, and canonical fingerprint, then reapplied and compared with the complete candidate. This detects accidental/stale/hidden changes, not authenticity: browser state is user-controlled, and SHA-256 is not a signature or authorization.
- Cross-tab writes use Web Locks where supported, plus before/after state checks. Browsers without Web Locks have best-effort conflict detection, not a database transaction. Undo/restore increment the revision even when revisiting identical content, so older proposals cannot become valid again.
- Overview, day titles, assumptions, and warnings remain the original generation narrative; targeted edits do not automatically rewrite them. Review the current activities and costs. Replacements preserve the planned-entry ID; additions get server UUIDs. Direct date/destination/budget changes, moving an existing activity between days, and whole-day regeneration are not supported chat operations.
- Hotel policies are not physical appointments. Only supplied planned movements reserve hotel logistics intervals. Legacy ambiguous hotel times are preserved without inventing movements. Airport and hotel buffers are estimates; attraction durations, routes, opening hours, and availability are not externally verified.
- Photographs load from Unsplash; functionality does not require successful image loading.

</details>

## Repository hygiene

Commit source, tests, documentation, `package-lock.json`, and the credential-free `.env.example` template. **Never commit private `.env` files (especially `.env.local`), credentials, `.next`, `node_modules`, or `.vercel` state.** Private environment files are ignored. Revoke/rotate any accidentally committed secret immediately; deleting its latest copy does not remove Git history. Changes are not automatically pushed.
