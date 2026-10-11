# TripPlannerAI

A Next.js trip planner with structured OpenAI generation, targeted conversational editing, deterministic travel-budget answers, and browser-persisted immutable itinerary versions. Phase 3.5 adds conversation-first responses with optional validated proposals/calculations, uncertainty safeguards, and an opt-in evaluation framework. Authentication, databases, and maps are not implemented.

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

### Test conversational editing

The editor uses the same private key, model, and mode as trip generation. With `TRIP_GENERATION_MODE=ai`, restart using `npm run dev` (stop any server launched with a shell-level `mock` override first).

1. Generate a short real itinerary or reopen an existing local preview.
2. Use a day's/activity's chat icon to select the intended target, or leave the focus on the whole itinerary.
3. Request "Replace the museum on Day 2 with shopping" or "Make Day 2 less busy". For a one-day trip, select an activity and request a cheaper alternative.
4. Review the explicit before/after activities and estimated cost change. Nothing changes until **Accept changes**. **Reject** leaves the itinerary unchanged.
5. Refresh to verify persistence. Use **Undo** or **History → Restore version** to revisit earlier snapshots. History shows descriptions, creation times, parent versions, and the active version.
6. Request removal of a day's last activity to check the one-activity minimum; request a conflicting time to check schedule validation. Invalid proposals explain the issue, not silently fix unrelated activities.
7. Keep a draft open and ask "Make it flexible" or an informational question. Refinement replaces the draft; questions keep it available. Saying "Yes" in chat never accepts changes.

One proposal request may incur API charges. Accept/reject/undo/restore are local and make no OpenAI calls. Automated tests and sample-mode browser checks do not confirm real-provider availability or recommendation quality. Verify a real edit with your configured account before release.

### Free development previews

```sh
TRIP_GENERATION_MODE=mock npm run dev
```

This explicitly exercises the API, form, editor, and storage with labeled illustrative data, without keys or paid calls. Sample editing supports naming a day and requesting "less busy", selecting an activity and requesting "cheaper" or "shopping", and empty-day explanations; it is not an offline language model. Mock mode is rejected in production. AI errors never silently fall back to sample data. Restore `ai` mode for real generation/editing.

## Checks

See [AI reliability and evaluation](docs/AI_RELIABILITY.md) for response boundaries, manual chat checks, the 115-scenario synthetic dataset (original 100 retained), and optional paid sequential evaluations. Ordinary tests never run live evaluations. `npm run eval:live` refuses paid calls unless explicitly invoked with `AI_EVAL_ALLOW_PAID=yes`; generated reports are ignored. Conversation quality remains model-dependent; no real-model accuracy results are claimed from mocked tests.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
```

Tests mock all OpenAI calls. They cover input/output contracts, IDs, arithmetic, storage compatibility, provider errors/timeouts, request controls, React loading/error behavior, targeted edits, conflicting operations, stale/tampered proposals, immutable versions, undo/restore, cross-tab changes, and failed storage writes. See [Phase 3 verification](docs/PHASE3_VERIFICATION.md) for browser checks and remaining limitations.

## Structure

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
docs/ARCHITECTURE.md          Contracts, decisions, tradeoffs, roadmap
```

RHF and the backend share one Zod request schema. The provider wire schema excludes IDs and totals: the server assigns UUIDs and validates schedules; pure code computes costs. The UI renders the domain contract, not provider-specific data.

## Reliability and limitations

- Maximum 14 inclusive days; past dates remain allowed for exploration.
- Default `gpt-4.1-mini` supports [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). A replacement model must support Responses/Structured Outputs and be tested for cost/quality.
- Output allowance: `min(12000, 1000 + 850 * inclusiveDays)`: 1,850 tokens for one day, 3,550 for three, 12,000 at the cap. This bounds output, not exact price or completion. Input tokens are also billable; consult [model pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
- Server timeout: 90 seconds; browser timeout: 110 seconds; SDK retries: zero. Incomplete output is rejected. Cancellation/timeouts do not guarantee provider billing stops.
- Request bodies: 32 KiB maximum, 10-second read timeout. Dates, lengths, activity ordering/non-overlap, pace, unique IDs, and nonnegative costs are validated.
- Edit bodies: 128 KiB maximum; messages ≤1,000 characters; at most eight recent context messages (each ≤1,000 characters), six operations, and 4,000 output tokens. Only current input/days and recent messages are sent, never all version snapshots. Complex/ambiguous requests receive clarification or an actionable error, with no automatic paid repair.
- Generation keeps its 2/3/4 pace-based activity count. Editing allows one to four activities per day; changes are all-or-nothing and may not overlap or cross midnight. Selected scopes, identities, unique per-day names, and conflicting operations are validated. Cost totals are recomputed in code, never trusted from the model.
- Form blocks duplicate submits. A bounded process-local guard rejects identical requests while running and for 20 seconds after success/failure. Storage-only retry reuses a successful result while the form stays mounted.
- **Before public deployment**, add durable server-side rate limiting, abuse protection, concurrency/spending controls, and usage/error metrics. The local guard is not a distributed quota: serverless instances have independent maps; different inputs bypass it; identical users may briefly collide. Origin checks are not authentication.
- Costs estimate one traveler: activities, accommodation, local transport, and additional meals not already included in activities. Travel to/from the destination is excluded. Totals are computed and over-budget plans flagged without artificially lowering prices. All recommendations need verification.
- Major-unit amounts rounded to two decimals are approximations, not a financial ledger or currency conversion engine.
- Inputs go to OpenAI; `store: false` disables Responses storage, not all provider retention. Avoid sensitive preferences. Logs contain only safe error codes/statuses, not keys, prompts, or provider payloads.
- Preview links and version history are local to the browser/origin. Clearing site data removes them; they are not shareable or durable. Legacy previews gain deterministic day IDs and an initial version, without deleting old data. Sessions are capped at 25 snapshots, 100 chat messages, and approximately 2 MiB serialized UTF-16 size; limits are explicit, with no silent pruning. A failed write does not publish an accepted change.
- Pending proposals are revalidated on receipt, recovery, and acceptance against the active version, monotonic revision, and canonical fingerprint, then reapplied and compared with the complete candidate. This detects accidental/stale/hidden changes, not authenticity: browser state is user-controlled, and SHA-256 is not a signature or authorization.
- Cross-tab writes use Web Locks where supported, plus before/after state checks. Browsers without Web Locks have best-effort conflict detection, not a database transaction. Undo/restore increment the revision even when revisiting identical content, so older proposals cannot become valid again.
- Overview, day titles, assumptions, and warnings remain the original generation narrative; targeted edits do not automatically rewrite them. Review the current activities and costs. Replacements preserve the planned-entry ID; additions get server UUIDs. Date/destination/budget changes, moving across days, and whole-day regeneration are outside this milestone.
- Photographs load from Unsplash; functionality does not require successful image loading.

## Dependency checks

Five high-severity development-only audit findings remain in the Next ESLint configuration's `braces` chain. No compatible upstream fix was available at verification. Production dependencies have no reported advisories. Avoid `npm audit fix --force`, which proposes an incompatible lint configuration downgrade.

## Repository hygiene

Commit source, tests, documentation, and `package-lock.json`. Environment files, including the local `.env.example` template, are excluded from this snapshot. **Never commit real `.env` files (especially `.env.local`), credentials, `.next`, `node_modules`, or `.vercel` state.** Private environment files are ignored. Revoke/rotate any accidentally committed secret immediately; deleting its latest copy does not remove Git history. Changes are not automatically pushed.

## Next milestone (approval required)

Review real-provider editing behavior and recommendation quality, then design Supabase ownership and durable version persistence. Add server-side rate limits, abuse/spending controls, and deployment verification before making paid endpoints publicly accessible. No next phase starts without approval.
