# TripPlannerAI

A Next.js trip planner with structured OpenAI generation, a responsive form, estimated costs, and browser-persisted previews. Phase 2 preserves the frontend foundation. Authentication, databases, maps, and a conversational editor are not implemented.

## Run locally

Use Node.js 22.13+ or a current supported LTS release.

```sh
npm ci
```

Environment files are not included in this repository snapshot. For real generation, create a `.env.local` file in the project root with these variables:

```dotenv
OPENAI_API_KEY=your_private_project_api_key
OPENAI_MODEL=gpt-4.1-mini
TRIP_GENERATION_MODE=ai
```

Create a project key in the [OpenAI dashboard](https://platform.openai.com/api-keys) and configure API billing/credits and usage alerts for your account. ChatGPT subscriptions do not configure this application's API access. Never paste keys into browser code, screenshots, or GitHub; do not use a `NEXT_PUBLIC_` prefix. Restart the server after environment changes.

```sh
npm run dev
```

Open the printed localhost URL and visit `/trips/new`. Start with a one-day trip and submit once. A successful response opens `/trips/<preview-id>`; refresh to check persistence. Costs are estimates, not verified prices or bookings.

### Free development previews

```sh
TRIP_GENERATION_MODE=mock npm run dev
```

This explicitly exercises the API, form, and storage with labeled illustrative data, without keys or paid calls. Mock mode is rejected in production. AI errors never silently fall back to sample data. Restore `ai` mode for real generation.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
```

Tests mock all OpenAI calls. They cover input/output contracts, IDs, arithmetic, storage compatibility, provider errors/timeouts, request controls, and React loading/error/retry behavior. Desktop/mobile browser regression checks exercise previews, validation, refresh, and error states without paid calls. A successful build or mock test does not establish real provider availability.

## Structure

```text
src/
  app/                       Server pages and route-level states
    api/trips/generate/      POST handler: validation, request controls, safe errors
  components/
    ui/                      Shared controls
    trips/                   Form, preview loader, itinerary view
  features/trips/
    schema.ts, types.ts      Shared domain validation and inferred types
    generation-contract.ts  API success/error envelopes
    generate-client.ts      Browser HTTP client and response validation
    costs.ts, format.ts      Pure arithmetic and formatting
    mock-data.ts             Illustrative activity templates
    mock-generator.ts        Explicit development/test generation
    storage.ts               Browser persistence and legacy compatibility
  lib/ai/                    Server-only SDK, configuration, prompts, wire schema,
                             normalization, body limits, duplicate guard, errors
tests/                       Domain, service, route, storage, and UI tests
docs/ARCHITECTURE.md          Contracts, decisions, tradeoffs, roadmap
```

RHF and the backend share one Zod request schema. The provider wire schema excludes IDs and totals: the server assigns UUIDs and validates schedules; pure code computes costs. The UI renders the domain contract, not provider-specific data.

## Reliability and limitations

- Maximum 14 inclusive days; past dates remain allowed for exploration.
- Default `gpt-4.1-mini` supports [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). A replacement model must support Responses/Structured Outputs and be tested for cost/quality.
- Output allowance: `min(12000, 1000 + 850 * inclusiveDays)`: 1,850 tokens for one day, 3,550 for three, 12,000 at the cap. This bounds output, not exact price or completion. Input tokens are also billable; consult [model pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
- Server timeout: 90 seconds; browser timeout: 110 seconds; SDK retries: zero. Incomplete output is rejected. Cancellation/timeouts do not guarantee provider billing stops.
- Request bodies: 32 KiB maximum, 10-second read timeout. Dates, lengths, activity ordering/non-overlap, pace, unique IDs, and nonnegative costs are validated.
- Form blocks duplicate submits. A bounded process-local guard rejects identical requests while running and for 20 seconds after success/failure. Storage-only retry reuses a successful result while the form stays mounted.
- **Before public deployment**, add durable server-side rate limiting, abuse protection, concurrency/spending controls, and usage/error metrics. The local guard is not a distributed quota: serverless instances have independent maps; different inputs bypass it; identical users may briefly collide. Origin checks are not authentication.
- Costs estimate one traveler: activities, accommodation, local transport, and additional meals not already included in activities. Travel to/from the destination is excluded. Totals are computed and over-budget plans flagged without artificially lowering prices. All recommendations need verification.
- Major-unit amounts rounded to two decimals are approximations, not a financial ledger or currency conversion engine.
- Inputs go to OpenAI; `store: false` disables Responses storage, not all provider retention. Avoid sensitive preferences. Logs contain only safe error codes/statuses, not keys, prompts, or provider payloads.
- Preview links are local to the browser/origin. Clearing site data removes them. Older mock previews gain deterministic day IDs. This is not durable storage or version history.
- Photographs load from Unsplash; functionality does not require successful image loading.

## Dependency checks

Five high-severity development-only audit findings remain in the Next ESLint configuration's `braces` chain. No compatible upstream fix was available at verification. Production dependencies have no reported advisories. Avoid `npm audit fix --force`, which proposes an incompatible lint configuration downgrade.

## Repository hygiene

Commit source, tests, documentation, and `package-lock.json`. Environment files, including the local `.env.example` template, are excluded from this snapshot. **Never commit real `.env` files (especially `.env.local`), credentials, `.next`, `node_modules`, or `.vercel` state.** Private environment files are ignored. Revoke/rotate any accidentally committed secret immediately; deleting its latest copy does not remove Git history. Changes are not automatically pushed.

## Next milestone (approval required)

Design targeted itinerary edit operations and immutable versions before implementing the conversational editor. Preserve unaffected day/activity IDs and validate edits against the full schedule. Ownership, durable version persistence, and public deployment controls remain future milestones.
