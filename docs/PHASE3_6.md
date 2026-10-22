# Phase 3.6: planning experience and constraints

## Scope and baseline

Implemented on `feat/trip-planning-experience` from merged Phase 3.5 main (`fb85528`). The original baseline passed 343 tests across 26 files plus lint, TypeScript, formatting and build checks. No authentication, cloud storage, mapping, booking, live flight/event services or new dependencies were added. No paid model evaluation is part of this phase's verification.

## Contracts and modules

- `features/trips/calendar.ts`: real calendar dates, bounded clock values, timezone validation, inclusive calendar arithmetic and airport-local conversion.
- `planning-schema.ts`: optional flight/accommodation, resolved geographic metadata, traveler count and seasonal preference.
- `schema.ts`: stable stored-record schema plus separate creation-only `newTripSchema(now)`; cross-field checks are shared with the form.
- `travel-planning.ts`: deterministic daily activity windows, estimated airport buffers and known accommodation appointments; used by mock generation, AI normalization and edit validation.
- `seasons.ts`: broad hemisphere/season and country-specific seasonal opportunities with explicit uncertainty.
- `lib/geography.ts`, `lib/validate-trip.ts`: server-only reference lookup, independent request resolution and metadata verification. See [reference provenance and licenses](../data/geography/README.md).
- `GET /api/destinations`: debounced autocomplete and exact manual resolution. `GET /api/airports`: IATA reference lookup. No external runtime API calls.
- `POST /api/trips/generate`: schema/date checks and trusted geography resolution before request guard or provider call; nested field errors are returned safely.
- `destination-combobox.tsx`, `travel-details.tsx`, `use-local-calendar.ts`: accessible selection, collapsed optional fields and hydration-safe local calendar policy.

All OpenAI code remains server-only. The original single-call generation/editing services, token allowances, deadlines, zero retries, six-operation cap, explicit acceptance and factual guardrails remain intact.

## Extended input

Existing fields retain their meanings and bounds. New optional fields are:

```text
resolvedDestination: id, name, region, countryCode, country,
                     latitude, longitude, timezone
timezone: validated IANA user calendar zone
travelers: integer 1..10
seasonalPreference: include | prioritize | exclude
travel:
  arrival/departure: number?, date?, time?, airportCode?, airport?
  accommodation: name?, location?, checkInDate?, checkInTime?,
                 checkOutDate?, checkOutTime?
```

The form defaults to one traveler and `include`. Amounts cover the **whole party**, not per-person numbers multiplied later. Ten travelers is the small-party product limit; group-tour logistics are outside scope. Budget remains the existing positive, finite, two-decimal bound. The server replaces client destination/airport metadata with canonical records; IDs merely looking valid are insufficient. New-record editing independently checks stored geographic metadata. Legacy records without metadata remain readable/editable under their original contract, not retroactively geographically certified.

Flight numbers are optional bounded reference strings such as `AC123`, not flight verification. Date-only boundary flights leave that day unscheduled because no safe activity time can be inferred. Number-only/airport-only inputs do not invent a schedule. Flight times need both a date and recognized airport. Accommodation text is bounded, rejects control characters, and remains user-supplied; a name does not identify a verified property or location. All supplied text is untrusted prompt data.

## Dates and timezones

New trips require a real `YYYY-MM-DD` date, start today or later, end on/after start, and at most 14 inclusive calendar days. Native date controls use min/max bounds; changing start clears an incompatible end rather than moving it. Zod still rejects impossible/leap-year/overlong dates independently of browser behavior.

The browser sends its IANA timezone and determines today locally. The server validates that identifier against `Intl` and computes today explicitly in that zone; older clients without a zone use the documented UTC fallback. A valid timezone does not prove the user's physical location. Stored records use the non-moving schema, so past trips and old versions still load.

Flight dates/times remain local to their referenced airport. The server converts known times to the destination's timezone for trip-boundary and activity-window checks. This supports international calendar changes without treating typed local times as UTC. Nonexistent/ambiguous DST times are rejected with a field error rather than silently choosing an instant. Arrival/departure must correspond to the destination start/end date. Date-only values must match the boundary since timezone conversion is unknowable without a time.

Accommodation dates must fall inside the trip, check-out must follow check-in, times require dates, and planned check-in/out cannot conflict with known arrival/departure buffers. These fields represent the user's planned appointments, not verified hotel policies.

## Scheduling and AI integration

The shared planner reserves an **estimated three hours** after arrival and before departure for procedures/transfer. Buffers can extend onto adjacent dates. Flight-constrained sightseeing is also bounded to 08:00-23:00 so an early departure cannot produce midnight activities. This is an explicit planning heuristic, not business hours or a verified sleep/transfer requirement. Known check-in reserves 30 minutes from the entered time; check-out reserves 30 minutes before it. Activities cannot overlap these slots or known flight windows. Neither airport recognition nor these buffers verifies geographic proximity or route duration; a remote airport may require more time than this estimate. Hotel names/addresses influence model organization but do not imply geocoding, luggage storage or transfer availability.

Ordinary generation keeps pace counts 2/3/4 and editing keeps 1..4 activities. Constrained days receive reduced bounded counts. Only flight-constrained days with an unknown boundary time or less than an hour available are logistics-only with zero activities, as approved. They render travel notes separately instead of invented sightseeing. All candidate edits pass the same window constraints, including at acceptance; unsupported metadata edits are not added to the operation contract.

The prompt receives canonical destination, all optional travel details, whole-party scope, exact date/count/window requirements and seasonal policy. Structured Outputs permits empty travel-day lists where needed; deterministic post-validation remains the authority for each day's exact count, chronological order, duration and windows. Invalid output is rejected, never silently rearranged or automatically repaired through another paid call.

## Seasonal intelligence and factual honesty

The planner supplies broad season/hemisphere context and a small set of general country/month opportunities (Japanese blossom viewing, Austrian/German winter markets, Korean autumn foliage and US holiday displays). These are guidance, not a live event database or fixed festival calendar. Trips crossing month boundaries consider all covered months. The model can provide other culturally relevant general suggestions, respecting interests and schedules.

`include` considers relevant opportunities, `prioritize` emphasizes them without overriding constraints, and `exclude` avoids deliberately adding seasonal activities. Prompts forbid invented named events, dates, venues, prices, availability and verification sources. Seasonal phenomena vary yearly; specific events require official schedule verification. Existing unsupported-claim checks include confirmed event assertions, but neither prompts nor textual heuristics prove factual accuracy or eliminate hallucinations. No exact current holiday calendar, blossom forecast, event feed or routing evidence is claimed.

## Persistence and editing compatibility

The new fields are optional with no schema defaults injected into legacy snapshots. Existing v1 previews and v2 sessions retain their keys, IDs and fingerprints. Loading historical snapshots never applies the new-trip past-date restriction or fabricates geographic/flight/hotel metadata. No destructive localStorage migration runs.

New metadata lives in each immutable input snapshot, surviving preview storage, chat proposals, acceptance, undo/restore and refresh. Metadata is not editable through activity operations. Current snapshot and travel windows go to conversational editing; accepted/rejected/stale drafts do not authorize future changes. The existing stale revision/fingerprint/candidate checks and storage-failure behavior are preserved.

## Verification and manual checks

Automated tests mock OpenAI. New coverage exercises dates/leap years/timezones/DST, geographic ambiguity/forged IDs/source failures, keyboard/mouse autocomplete, optional/malformed travel details, arrival/departure buffers, accommodation conflicts, constrained empty days, seasonal policy, whole-party context, pre-provider rejection, metadata persistence and immutable edit history.

Executed checks on October 10, 2026 (local calendar):

| Check                   | Result                                                       |
| ----------------------- | ------------------------------------------------------------ |
| `npm test`              | 433 tests passed, 29 files; 90 tests added over the baseline |
| `npm run lint`          | Passed                                                       |
| `npm run typecheck`     | Passed                                                       |
| `npm run format:check`  | Passed                                                       |
| `npm run build`         | Passed, including the final rerun after browser refinements  |
| `git diff --check`      | Passed                                                       |
| Mock browser regression | Passed at 1440x1000 desktop and 390x844 mobile               |

Browser checks used isolated headless Chrome with Playwright, not an existing personal browser session. Verified landing/form navigation, keyboard/mouse city selection, clearing invalid end dates, airport resolution, optional fields, whole-party/seasonal metadata, constrained generation, reject/accept, undo/restore, refresh persistence, mobile generation without optional details, and a logistics-only arrival day. No horizontal overflow or browser page exceptions were detected. Screenshot evidence is available in `/private/tmp/tripplanner-phase36-{desktop,mobile}-{form,preview}.png`. A pre-existing Next image LCP advisory remains; it is not a runtime error.

During finalization, one persistence unit test exceeded its five-second timeout while initializing the full geographic snapshot alongside other checks. It now uses fixed destination/airport metadata to test persistence independently; dedicated geographic integration tests still exercise the real snapshots. The rerun passed all 433 tests without changing application behavior or relaxing assertions. The project owner reviewed the application in the browser and found the functionality and experience satisfactory; this does not constitute independent verification of every edge case or real-OpenAI recommendation quality.

The staged whitespace check also identified an extra blank line at the end of the imported airport license. Only that trailing whitespace was removed; the license text is unchanged. The explicit importer now normalizes its final newline to avoid reintroducing the issue.

Production tracing was inspected for all four API handlers: both gzip datasets are included. `.env.local`, other environment files and build/dependency directories remain ignored; no environment/private-key files are tracked. A filename-only credential-pattern scan of the version-control candidates found no suspicious key files. No credentials or private conversations were printed. No live model evaluation was invoked; the existing Phase 3.5 evaluation fixtures remain unchanged.

### Changed-file map

New files: the calendar, planning, seasonal, geography and validation modules listed above; two lookup handlers; destination/travel/calendar UI helpers; `next.config.js`; geographic gzip snapshots, provenance, license and README; explicit import script; this document; and travel-planning, combobox and unavailable-source tests.

Modified files: trip form/view and global styles; shared input/itinerary schemas, mock generator, edit engine and generation client; generation route; AI generation/edit prompts and services, generation requirements/wire schema, safe errors, claim policy and sample editor; generation-route, form and session-storage tests; README, architecture documentation and Prettier's binary-data ignore list. No package dependencies or existing storage keys changed.

Manual real-API checklist (only after consciously enabling paid `ai` mode):

1. Select Osaka, April 15-20, 2027, two travelers, a whole-party budget and seasonal `include`.
2. Add KIX arrival April 15 at 16:30, departure April 20 at 11:00, central Osaka accommodation, planned check-in 20:00 and check-out 07:30.
3. Confirm no activity before 19:30 on arrival day or overlapping hotel appointments. The 11:00 departure has no sightseeing window after the airport buffer, so its day should be logistics-only. Buffers must be described as estimates.
4. Repeat with 23:30 arrival and 01:00 departure, omitting incompatible hotel appointments. Boundary days should show logistics only, with spillover constraints on adjacent days.
5. Generate without any optional details. Try impossible/past/15-day dates, an unknown city and ambiguous Springfield; no paid generation should occur for invalid input.
6. Compare `prioritize` and `exclude` seasonal policies. Verify the wording never implies confirmed festival dates, prices or blossom conditions.
7. Request a shopping replacement, review then reject; request a valid change and accept. Try a conflicting arrival-day time, undo, restore and refresh. Metadata and active versions should remain intact.
8. Reopen an old past-dated trip. It must display without asking for new dates or inventing travel metadata.

Real-model recommendation quality and precise travel feasibility remain manual checks, not guarantees derived from mocked tests. Future work may add verified routing/places/events and configurable per-airport buffers only with approval. No next phase begins automatically.

## Post-PR conversational editing smoke-test fixes

These fixes remain local on the feature branch pending approval; they do not merge or deploy PR #5.

### Findings

- Test B: the development diagnostic recorded `proposal / NO_CHANGE`. `applyEditOperations` compares the canonical candidate with the base and rejects an unchanged itinerary. The original operations were not logged, so their exact contents cannot be reconstructed. The normalizer previously retained the model's optimistic narration even after this rejection, then appended an error. This was a deterministic presentation defect, distinct from the model choosing an ambiguous alternative or generating ineffective operations.
- Test C: the production contract permits `proposal: null`, and `normalizeConversation` correctly returns an informational answer for that output. No production edit-verb whitelist prevents a valid replacement. The transcript alone does not reveal the raw output; model omission of a proposal is consistent with the observed result, but cannot be proven from retained diagnostics. Do not manufacture an operation from prose or retry the paid call.
- Test A: `editInput` already supplies stored input, exact activities, chronological outcomes and deterministic `planningWindows`. There is no hardcoded arrival time. The observed 17:40 cannot independently be checked against the user's browser-local record from server logs. An unverified "too late for the castle's hours" assertion is now caught by the factual presentation policy, not treated as evidence about actual hours.

### Changes and safeguards

- Prompt `chat-3.6-v2` explicitly distinguishes agreement to one offer from agreement to multiple alternatives. Ambiguous agreement requires a focused choice, not an arbitrary proposal. Explicit feasible replacements should produce operations even when the attraction is present on another day. This is model guidance, not a deterministic guarantee of conversational understanding.
- Central output-only action narration filtering in `conversation-facts.ts` removes common completion/promise claims. It does not classify user intent or authorize actions. Valid proposals receive a server-authored review status and deterministic current/proposed totals. Failed proposals discard their entire model narration, preserving independent calculations and the specific validator explanation. No-op errors explain that there is no new change to review, without claiming a particular activity was already scheduled when that is unknown.
- No model call, retry, token limit, schema, storage key, edit operation, acceptance check or itinerary mutation behavior was added or relaxed. Pending/accepted/rejected/stale outcomes still accompany chronological context. Agreement only requests preparation; acceptance controls remain the sole version-creation path.
- Empty days remain valid only when `travelWindow.travelOnly` is true. Such days cannot accept sightseeing. A flight day with a usable activity window retains the existing minimum; its additions must fit both the airport window and hotel appointments. These are planning constraints, not verified venue hours.

### Verification and retest

`tests/travel-edit-reliability.test.ts` adds 20 deterministic regressions for presentation, no-ops, independent calculations, explicit replacements, cross-day redundancy, separate ambiguous turns, acceptance, stored arrival/hotel context, valid additions and rejected flight/hotel conflicts. Provider responses are mocked: these tests verify integration and prompt context, not actual model interpretation. Existing generation, whole-party calculations, seasonal input, geography/date validation, stale checks, undo/restore, persistence and legacy tests remain intact.

Manually retest in consciously enabled paid AI mode:

1. Inspect your stored Osaka arrival and hotel times; ask for the April 15 castle visit at 21:00. Verify conflicts are explained without a claim of verified venue hours.
2. If offered two alternatives, submit `Yes` separately. Expect a focused choice, no saved change. Agreement to a single clear offer may prepare a draft but must not accept it.
3. Request the April 17 castle replacement explicitly, even with an April 16 visit present. Expect a valid reviewable replacement or an actual constraint, not just hypothetical prose.
4. Repeat an already scheduled change. Expect a no-op explanation without promises or completion claims.
5. Ask Day 2 total spending for both travelers; compare the server calculation. Reject a proposal, then accept a new valid one; undo, restore and refresh. Only explicit acceptance should create a version.

Remaining limits: no live hours or route verification, no stored raw model-output replay, and prompt-following remains model-dependent. The narrow output assertion filter is not a semantic proof against every possible paraphrase. No paid evaluations were run; real-API resolution remains subject to this manual retest.

Final executed checks for these local fixes: `npm test` passed 453 tests across 30 files; `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` and `git diff --check` passed. Isolated mock-mode Chrome checks passed at 1440x1000 and 390x844 for creation, travel metadata, proposal reject/accept, undo/restore, refresh, layout overflow and page exceptions. Environment files remain ignored/untracked; the seven changed/untracked files contained no credential patterns. No commits, pushes or deployments were performed. GitHub inspection found PR #5 already merged at 2026-10-11T02:11:03Z, contrary to the stated open-PR baseline; this session did not merge it or modify its state.
