# Phase 3.8: Reliability and stabilization

## Baseline and preservation

Work uses the isolated `codex/reliability-stabilization` branch, based on `origin/main` at `40a5c93` (merged PR #6). The original checkout remains on `feat/trip-planning-experience`; it was not reset, cleaned, stashed, switched, overwritten or committed.

All seven existing stabilization files were inspected and copied into this worktree after confirming their committed baselines had not changed on main:

- `docs/PHASE3_6.md`
- `src/lib/ai/claim-policy.ts`
- `src/lib/ai/conversation-facts.ts`
- `src/lib/ai/conversation-normalizer.ts`
- `src/lib/ai/conversation-prompts.ts`
- `src/lib/ai/edit-prompts.ts`
- `tests/travel-edit-reliability.test.ts`

They already added ambiguous-confirmation/replacement guidance, action-narration filtering, specific no-op explanations, an unverified-hours safeguard and 20 tests. Baseline with those changes: **526 tests across 33 files passed**, compared with merged Phase 3.7's 506/32. Phase 3.8 builds on them; it does not implement them again. Scheduling regression fixtures that meant actual hotel appointments now explicitly use planned movement fields, retaining their original conflict assertions.

## Root causes

### Hotel policy versus movements

`tripInputSchema` compared old check-in/out times directly with buffered flights. `travelWindow` also reserved 30-minute appointments from these times. The form explicitly asked for planned times, but users reasonably supplied hotel opening/deadline policies. The data model could not express that distinction. A valid late arrival or early departure therefore looked contradictory.

### Missing proposals and optimistic narration

The previous conversation-first wire contract allowed `proposal: null` for any response, without a structured explanation of what information was missing. An answer or question with null operations bypassed proposal construction entirely; the browser correctly had nothing to review. Additional prompts alone could not enforce a concrete proposal path. The exact historic real-model payloads were not retained, so their precise model decision cannot be proven retrospectively; deterministic fixtures reproduce this permissive contract path. No evidence points to the browser silently removing a validated proposal.

The carried-over fixes already removed confident narration after invalid/no-op proposals. For the new provider contract, valid proposal narration is now also derived from the validated operation summary, never an optimistic model success claim. Conversation-only responses remain natural; no user edit-verb whitelist or second classifier is introduced.

### Conflicting cost answers

`safeConversationMessage` stripped unsupported model totals and inserted the literal "not a validated calculation" fallback before the independent calculation was evaluated. That fallback survived even when server arithmetic succeeded, creating a contradiction. Existing day/trip responses also did not consistently spell out whole-party scope, and the calculation contract lacked per-person/budget-status/highest-day variants.

## Hotel contract

Existing optional accommodation name, location, check-in date and checkout date remain. New fields are optional:

| Field                                                     | Meaning                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| `checkInAvailableFrom`                                    | Destination-local hotel check-in opening policy, not an appointment |
| `checkOutBy`                                              | Destination-local checkout deadline; earlier departure is allowed   |
| `plannedHotelArrivalDate` / `plannedHotelArrivalTime`     | Explicit traveler arrival, only when both supplied                  |
| `plannedHotelDepartureDate` / `plannedHotelDepartureTime` | Explicit traveler departure, only when both supplied                |

Policy-only trips require no movements or additional dates. If comparing a planned movement to a policy, the stay date must be supplied: a 00:10 hotel arrival may belong to the previous night's booking and must not be compared blindly with 15:00 on the new calendar day.

`hotel-validation.ts` validates paired movement fields, stay/trip date bounds, ordering, opening/deadline comparisons and applicable estimated flight buffers. Explicit movements reserve an estimated 30 minutes after arrival or before departure; overlapping arrival/departure logistics buffers are rejected. Midnight-spanning buffers are split across destination-local calendar days. Existing three-hour airport/transfer buffers remain estimates, not verified route data. Invalid/nonexistent/ambiguous destination-local movement times are rejected. Hotel policies alone never reserve appointment intervals.

Shared travel windows enforce the same rules in generation, mocks and deterministic editing. Late-flight/early-departure sightseeing bounds and genuinely logistics-only days are unchanged. Generation/chat receive policy fields, actual movements, planning windows and assumptions; neither may infer a movement from a hotel policy or fabricate a confirmed transfer time.

### Legacy compatibility

Old `checkInTime` / `checkOutTime` values remain accepted and preserved exactly, but are unclassified metadata. They are not copied into either new policy fields or planned movements. Travel notes disclose their ambiguous meaning and request confirmation before relying on them. Because historical input objects are not rewritten or default-populated, input equality, IDs, fingerprints, version ancestry and pending-proposal snapshots remain intact. Existing preview/session storage keys and schema version remain unchanged; no destructive migration is run. Moving "today" constraints still apply only to creation, never historical reading.

## Conversation/action contract

The single Responses API call now uses `providerConversationSchema`:

```text
message + presentation + boundary + calculation + action
action = proposal(1-6 supported operations)
       | clarification(missing field, focused question)
       | unsupported(specific limitation)
       | none(informational/preference/no-change/boundary reason)
```

The root is an object with a nested action union, following [official Structured Outputs requirements](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). A proposal action cannot omit operations; clarification names day, activity, replacement, schedule or ambiguous confirmation, not permission to prepare a draft. Request context includes trusted edit capabilities explaining delegated target selection and review-only acceptance. It continues to contain only active itinerary data, bounded chronological context, current pending draft and existing planning windows, not complete history. Prompt versions are `chat-3.8-v1` and `generation-3.8-v1`.

`adaptConversationOutput` maps new provider output into the existing browser response pipeline. Legacy recorded fixture/message/proposal shapes remain supported. New/legacy fields cannot be mixed silently. Proposal and calculation components are defensively normalized independently: malformed arithmetic cannot erase a valid proposal, and an invalid action cannot erase valid arithmetic. Security boundaries and genuinely incompatible boundary actions still fail closed.

The existing edit engine remains the authority for IDs, scope, duplicate names, conflicts, activity counts, schedules, flight/hotel constraints and no-ops. Valid new-contract proposal messages use the deterministic edit summary and explicit pending-review status. Rejected/invalid/no-op proposals discard optimistic narration and report a specific failure while preserving a valid calculation. Accept/reject, revision/fingerprint checks, immutable versions, undo/restore and refresh persistence are unchanged. Agreement in conversation is never acceptance.

This is a structural reliability improvement, not a guarantee of perfect model understanding. A model can still select an inappropriate clarification or no-action decision; the application will not invent an edit, make a second paid call or bypass review to repair it. Real-model manual testing remains necessary.

## Authoritative cost answers

`answerTravelQuestion` computes day/trip totals from recorded activity and additional estimates, using the stored currency and traveler count (legacy default one). New query variants cover per-person equal allocation, remaining budget, over-budget status, highest-cost day (including ties) and cost scope. Negative remaining budget is presented as a positive overrun, not available money. Missing optional legacy expense categories are disclosed as incomplete samples; invalid recorded costs do not become zero or NaN answers. No new expense breakdown is invented.

After a calculation succeeds, output-only financial/numeric model commentary is removed and replaced with authoritative server text. This is not keyword-based interpretation of user messages. Unrelated nonfinancial advice can remain. Current, hypothetical and validated-candidate totals are labeled separately. Model arithmetic is never the source of the displayed amounts. A malformed calculation remains an explicit partial failure and cannot block an independently valid edit proposal.

## Files and coverage

Main implementation: `planning-schema.ts`, `hotel-validation.ts`, `schema.ts`, `travel-planning.ts`, `travel-details.tsx`, `chat-contract.ts`, `travel-questions.ts`, `conversation-facts.ts`, `conversation-normalizer.ts`, provider schemas/prompts/service and deterministic demo routing. No Phase 3.7 photo/map/provider code is changed.

New regression suites: `hotel-semantics.test.ts`, `authoritative-costs.test.ts`, `proposal-contract.test.ts`. They cover late/early flights with policy times, explicit movement conflicts, midnight buffers, generation/editing windows, unchanged legacy storage/fingerprints, delegated and cross-day replacements, ambiguous agreement, malformed components, no-op/duplicate/scope/stale rejection, acceptance/undo/restore, whole-party/per-person estimates, budget signs, supported currency formatting and authoritative narration. Existing tests remain enabled.

Evaluation dataset version `travel-reliability-v6` preserves all 115 existing scenarios and adds 10 stabilization scenarios (**125 total**). Graders understand the new provider contract; the opt-in live runner uses the same production schema. Ordinary tests use mocks; no real-model accuracy result is claimed. `npm run eval:live` was not executed.

## Manual real-API smoke test

Only perform this section after explicitly enabling AI mode with a private key; it makes paid calls. No real OpenAI calls were made during implementation.

1. Create Osaka, April 15-20, 2027, two travelers. Arrival KIX April 15 at 20:30; departure KIX April 20 at 09:00. Hotel check-in opens 15:00 on April 15; checkout due 11:00 on April 20. Leave movements blank. Confirm creation accepts policies and boundary days do not invent sightseeing.
2. Optionally plan hotel arrival April 15 at 23:45 and departure April 20 at 05:30. Confirm valid. Try arrival at 21:00 or departure at 07:00; confirm field-specific estimated-buffer errors. Restore valid values before generation.
3. Ask "Can you replace one of my activities on April 17 with a visit to Osaka Castle? Keep the schedule realistic." Expect a reviewable proposal or a specific real constraint, not permission to prepare one. Confirm all saved data stays unchanged before accepting. Repeat with a castle already on another day; redundancy alone must not prevent a feasible replacement.
4. After an assistant question with two alternatives, reply "Yes." Expect a focused choice question, no arbitrary proposal and no accepted version.
5. Ask Day 2 total for both travelers, per-person Day 2 cost, remaining budget and highest-cost day. Compare with stored estimates; no "not validated" disclaimer should contradict server arithmetic. Mixed spending/replacement requests must label current versus proposed costs.
6. Reject one proposal; accept another. Undo, restore and refresh. Confirm version count, active version, metadata, unrelated IDs and legacy trips remain correct. Check hero/photo/map, expand/Escape/focus behavior and mobile form layout.

## Executed verification

### User-reported real-API acceptance results

The user manually tested the following interactions with the real OpenAI API and reported success before finalization. These are focused acceptance observations, not a live evaluation benchmark or proof of geographic feasibility:

- **Delegated replacement:** "Replace one of my activities on Day 2 with a visit to Universal Studios Japan. Choose whichever activity makes the most sense to replace and keep the schedule realistic." The assistant proposed replacing Shopping in Shinsaibashi with Visit Universal Studios Japan. The proposed total changed from $960 to $980; explicit acceptance succeeded without unnecessary clarification.
- **Addition:** "Can you add a visit to Dotonbori on Day 3 in the evening?" produced an Evening visit to Dotonbori proposal. The proposed total changed from $980 to $1,020; explicit acceptance succeeded.
- **Whole-party calculation:** "How much are we spending on Day 2 in total for both travelers?" returned a current Day 2 estimate of $395, trip total $1,020 and budget $2,000, explicitly covering both travelers and distinguishing estimates from verified prices.

Universal Studios Japan may require a full day. Successful structured replacement does not establish an appropriate attraction duration or verified travel time. Phase 4 will address geographic itinerary feasibility and attraction durations; it is not implemented in this phase. No additional paid OpenAI calls or live evaluations were performed during finalization.

| Command                | Result                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm test`             | **580 passed across 36 files**: 506 merged-baseline tests, 20 carried-over tests and 54 new regression cases |
| `npm run lint`         | Passed                                                                                                       |
| `npm run typecheck`    | Passed                                                                                                       |
| `npm run format:check` | Passed                                                                                                       |
| `npm run build`        | Passed; nine routes compiled/generated                                                                       |
| `git diff --check`     | Passed                                                                                                       |

The 125 evaluation fixtures were validated as deterministic data; no paid live evaluation was run. One run overlapped with browser compilation and hit five existing 5-second cold geographic-data timeouts. The full suite passed when rerun alone with unchanged assertions and timeouts; no timeout was raised or test skipped to hide this resource-contention failure.

Actual Chrome development checks passed at 1440x900, 768x1024 and 390x844 with mocked photo metadata/images/tracking and real offline WebGL MapLibre. They verified camera/marker synchronization, hero transitions/credits, compact/expanded single-canvas behavior, focus/Escape/scroll restoration, reduced motion, no horizontal overflow and exactly two search/two use events for two selections, with no external provider API calls (the fixed default photo may load directly from its CDN). A mobile expanded-hotel form check passed with distinct policy/movement labels and no overflow. The desktop end-to-end workflow accepted late-arrival/early-departure policy times, displayed field-specific invalid-movement errors, generated a mock itinerary, rejected/accepted edits, undid/restored/refreshed versions, and verified displayed day/per-person/highest-day cost responses against persisted authoritative data without creating versions for questions.

The worktree's 28 changed/untracked files passed the credential-pattern/private-env scan. `.env.local` remains ignored and no credentials were copied. The original checkout's seven modified/untracked files remain untouched. Mock checks do not verify model semantics, live provider behavior or physical-device touch accessibility; the separate user-reported real-API results above cover only those specific interactions.

The same three hero/map viewport checks also passed against the locally served production build, including nonblank expanded-canvas pixel checks. This is local verification, not deployment. Mock itinerary generation is development-only and was not forced on in production.

### Finalization recheck

The fetched `origin/main` still matched the Phase 3.7 merge baseline. The full suite initially passed 578/579 tests with one existing cold geographic-data route import exceeding five seconds; an isolated rerun passed all 579 unchanged tests. A finalization regression was then added to `trip-form.test.tsx` for clearing a server-side hotel movement error after removing optional movement fields; it passed without an application-code change. The final full-suite result is the 580/36 result above. No assertions or timeouts were weakened.

An isolated credential-free mock browser preview accepted Osaka April 15-18, 2027 with arrival 20:30, departure 09:00, check-in opening 15:00 and checkout deadline 11:00, with planned movements blank. An explicitly planned arrival at 19:00 was rejected with an estimated-arrival-buffer error. Generation preserved policy-only logistics without inventing planned movements. Rejecting a draft retained version 1; accepting another created version 2; undo, restore and reload retained both immutable versions and their outcomes. The subsequent whole-party Day 2 answer matched the displayed $183.32 estimate and $458.30 trip total without creating another version. Legacy ambiguous-field compatibility remains covered by deterministic storage/fingerprint tests.

Desktop (1440x900) and mobile (390x844) browser checks confirmed the cinematic default hero, referral attribution links, destination autocomplete/marker synchronization, offline map, single-canvas expanded dialog, Escape focus restoration and no horizontal overflow. Browser error logs were empty. City-specific photos and detailed provider tiles were not requested during finalization: provider credentials were disabled, fallback behavior was exercised, and mocked provider regressions ran in the automated suite. Earlier three-viewport photography mock checks are recorded above; live provider behavior was not reverified. No paid calls were made.

## Remaining limits

No authentication, cloud storage, bookings, external hotel/flight lookup, maps/routing additions, model changes or paid evaluations are part of this work. Finalization authorizes a commit, feature-branch push and review-only pull request, not a merge or deployment. Hotel policies are user supplied, not verified; late-arrival acceptance and luggage storage remain unknown. Airport/hotel buffers are fixed planning estimates. Historical ambiguous hotel times need user confirmation, not automatic interpretation. The existing Node engine warning (host 22.5.1 versus recommended 22.13+) and five high-severity ESLint-chain advisories remain unrelated maintenance items.
