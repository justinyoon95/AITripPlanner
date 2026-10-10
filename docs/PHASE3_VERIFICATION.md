# Phase 3 verification

Phase 3 is finalized on `feat/itinerary-chatbot` for pull request review against `main`. No merge, deployment, database, authentication, maps, or new dependencies are included.

## Automated checks

Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run format:check`.

Final run: 164 tests passed across 17 files; lint, strict TypeScript, production build, formatting, and `git diff --check` passed. Checks run sequentially to avoid build/test resource contention.

Vitest mocks every OpenAI call. Added suites cover deterministic edits and preserved data, conflicting/invalid operations, request bounds, server-assigned identities, strict Structured Outputs, clarification, missing keys, provider failures/timeouts/cancellation, response validation, stale/tampered proposals, immutable history, undo/restore/branching, storage migration/recovery, failed writes, and cross-tab conflicts. React tests check loading/duplicate blocking, review/accept/reject, persisted history, errors, stale acceptance, activity focus navigation, and recovery with blocked storage.

## Browser regression procedure

Use `TRIP_GENERATION_MODE=mock npm run dev -- --port 3000` to avoid API charges.

- Desktop 1440 × 1000: landing navigation and original form; 15-day rejection; three-day preview with Food/Culture; proposal shown before applying; refresh retains pending proposal; acceptance updates only Day 2 and deterministic totals; refresh retains accepted version; undo restores original entries; history restores version 2 with active marker, summary, and timestamp.
- Scoped cheaper replacement: select Day 2's activity icon, inspect before/after price/activity, reject; active version and trip values remain unchanged.
- Empty-day request: receive clear clarification, with no new version. Repeated less-busy edits stop at one activity rather than silently removing the last entry.
- Mobile 390 × 844: scoped editor, proposal review/actions, refresh, history and keyboard tab switching. Document scroll width equals viewport width, with no oversized main-content elements.
- Two tabs: both load a pending proposal; acceptance in one tab updates the other to version 4, displays a cross-tab notice, and removes its acceptance control. Unrelated days remain intact.
- Temporarily launch with `OPENAI_API_KEY='' TRIP_GENERATION_MODE=ai npm run dev -- --port 3000`: edit failure displays safe configuration error, retains the active version, and does not fall back to sample editing. Restore the desired mode afterward. No credential file is edited for this check.

Browser checks use the actual application API/local storage and labeled sample responses. The React suites additionally simulate storage failure and stale/tampered proposals deterministically. These are regression checks, not a real OpenAI quality or load test.

## Real-provider smoke test

The project owner reports that manual tests against the real OpenAI API passed for conversational editing, proposal review, acceptance/rejection, undo/restore, and browser persistence. The automated suite uses mocked provider calls and does not incur API charges.

Use the private root `.env.local` with `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4.1-mini`, and `TRIP_GENERATION_MODE=ai`. Stop any shell-overridden sample server; restart normally. Open `/trips/new`, generate a short trip, select an activity, and request a cheaper alternative. Check the declared diff, accept, refresh, undo, restore, and verify unrelated activities/IDs remain unchanged. A same-day overlapping reschedule should return an actionable error, not move other activities silently. An ambiguous/too-large request should clarify or report the bounded-output limit.

API calls incur costs; acceptance/history actions do not. Timeouts/cancellation do not guarantee provider billing stops. Factual location/pricing/hours/route verification remains unavailable.

## Remaining limitations

- No account-backed ownership/durable storage. Clearing site data removes sessions. Fingerprints are consistency checks, not signatures.
- Cooperative cross-tab serialization uses Web Locks; unsupported browsers have best-effort optimistic checking. This is not multi-user collaboration.
- Six operations, 1–4 activities/day, 14 days, eight context messages, 4,000 output tokens; full history is never sent. History/storage caps fail explicitly, without pruning.
- Narrative fields remain from original generation. Across-day moves, changed trip input and whole-day regeneration are unsupported.
- Public paid endpoints require durable rate limiting, abuse protection, spending/concurrency controls and monitoring before deployment. The existing process-local duplicate guard is not sufficient protection.
- Existing development-only dependency advisories and Node version guidance remain documented in README. No dependency upgrades are bundled into this milestone.
