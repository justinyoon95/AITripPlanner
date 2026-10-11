# Phase 3.5 verification

Phase 3.5 is finalized for review on `feat/ai-reliability`, based on merged Phase 3 at `779fe27`. The user authorized committing, pushing this branch, and opening a pull request to `main`; merging, deployment, and Phase 4 remain unapproved. No credentials or private environment files changed.

The user personally confirmed that the final mixed-action request works with the real OpenAI API. This is a manual acceptance result, not an agent-run live evaluation or evidence that all 115 fixtures pass against the model. The full automated suite, lint, TypeScript, formatting, build, and whitespace checks were rerun for finalization.

## Automated verification

Run the full suite, lint, TypeScript, formatting, production build, and `git diff --check` before completion. Existing Phase 1-3 suites remain intact. New tests cover intent/action mismatches, informational-state preservation and refresh, version caps, supported cultural/currency questions, deterministic budget calculations, invalid references, unsupported claims and honest limitations, direct/embedded injection, schema compatibility, dataset/grader reproducibility, paid opt-in and unknown usage.

Final local verification on 2026-10-10:

- `npm test`: 343 tests passed across 26 files after the final mixed-action fix; provider calls mocked. The original historical-contract suites remain, alongside production-contract/provider-context tests.
- `npm run lint`, `npm run typecheck`, `npm run format:check`: passed.
- `npm run build`: optimized production build passed.
- `git diff --check`: passed. No environment files tracked; `.env.local` remains ignored.

Run Next.js type generation/typecheck separately from the production build. A concurrent verification attempt briefly removed generated `.next/types` files under TypeScript; the standalone typecheck passed after the build finished. This was a verification-process race, not an application source error.

`npm run eval:live` without the shell opt-in is expected to exit nonzero with `Paid calls disabled` before reading environment files or contacting OpenAI. This is a verified safety gate, not a benchmark failure. Live model evaluations and a measured prompt baseline have **not** been run; no real-model accuracy, latency or cost measurements are claimed.

## Browser regression

Explicit mock mode exercises the actual local API without paid calls. Verify desktop (1440 x 1000) and mobile (390 x 844): original trip form/14-day limit, three-day preview, deterministic budget answer, informational/refusal/clarification messages with no new version, unsupported-current-fact limitation, proposal review/accept/reject, refresh, undo/restore, keyboard tabs, and no horizontal overflow. Check the server log for absence of paid mode during this procedure. Restore the prior AI-mode server afterward without editing credential files.

Mock browser behavior is intentionally limited, not a substitute for real-provider intent-quality evaluation. See [manual real-mode instructions and limitations](AI_RELIABILITY.md).

The desktop/mobile checks above passed against the local mock-mode server, including acceptance/rejection, descriptive active-version history, undo/restore, refreshed chat persistence, keyboard tab navigation, and informational-state preservation. Both viewports had no horizontal overflow. No paid requests were made. The server was stopped for the production build and restored in AI mode afterward.

## Reported real-API regressions

The fixes are documented in [root causes and changes](AI_RELIABILITY.md#conversation-integration-fixes). Dataset `travel-reliability-v5` now has 115 scenarios: the original 80 v3 cases, 20 conversation-first cases, and 15 integration cases. New provider tests use controlled structured outputs and verify separate chronological requests, preference-only acknowledgments, optional proposals/calculations, one SDK call per message, invalid candidates, legacy storage and production rejection of the old wire shape. These are not measurements of real-model understanding.

Repeated desktop/mobile checks used a fresh three-day Toronto sample. Budget/destination requests preserved Version 1; `Make my itinerary better` → `Day 1` → `Fewer activities` produced a Day 1 removal proposal. Acceptance created Version 2, undo returned to Version 1, restore and refresh retained Version 2. Mobile checks covered Day 4 hours, museum etiquette, a relaxing-day proposal, rejection, persisted messages and keyboard history tabs. Scroll width equaled viewport width at 1440 and 390 pixels. Browser logs had no runtime errors; the unchanged form image still emits a development LCP loading-priority warning.

No paid OpenAI calls or live evaluations were made by the agent for these fixes. Mock browser checks and controlled model-output tests are not proof that real-provider conversational quality is fixed for all phrasings. Repeat the manual checklist below using real AI mode.

Final conversational desktop/mobile walkthrough used a fresh three-day Osaka sample. `When does GU close?`, `on day 1`, and `in Namba` retained informational context and Version 1. Three separate editing requests (`Make my itinerary better`, `Day 1`, `Fewer activities`) produced a reviewable proposal; acceptance created Version 2. Undo restored Version 1, restore plus refresh retained Version 2. Fresh hours questions after completed proposals remained informational. Mobile rejection preserved Version 2, and another day follow-up remained an answer. Scroll widths matched viewports at 1440 and 390 pixels. Browser logs showed no runtime errors; the existing form-image LCP priority warning remains. Duplicate AI-mode notices are covered by persisted-message component tests; mock-mode UI intentionally omits AI recommendation warnings.

Conversation-first browser regression repeated generation and editing against the new provider contract using free mock mode. On desktop (1440 x 1000), preference acknowledgment did not create a proposal; a natural shopping request on a varied-interest sample produced an addition preview with separate current/proposed totals. Acceptance, undo, restore and refresh retained the expected snapshots. On mobile (390 x 844), preference discussion after acceptance kept Version 2 active; three separate improvement/day/fewer-activities messages produced a removal proposal. Rejection kept Version 2, and hours/day follow-ups remained informational after refresh. No horizontal overflow or runtime errors; the existing LCP image warning remains. A single-interest sample exposed pre-existing duplicate names and correctly returned an edit constraint explanation; no validator was weakened. Mock results verify integration, not real-provider conversational quality.

## Manual real-mode checklist

### Latest integration retest

Final mixed-action regression: `mixed-action-regression.test.ts` covers the exact Day 1 and equivalent Day 2 requests through mocked Structured Outputs, the real local API route and browser response adapter. Cases include clarification plus valid components, unresolved dinner questions with valid costs, invalid calculation targets, malformed component shapes, conflicting operations, both components failing, genuine boundary conflicts, deterministic current/proposed daily and trip costs, explicit acceptance, stale rejection and undo/restore. Full provider/UI/persistence suites also remain in the final verification. No new browser UI changes or paid evaluations were needed for this targeted fix.

1. Ask `When does GU close?` and separately `When does GU close on a typical Tuesday?`. Expect a useful hours limitation, not an application error or invented time. Follow with `On Day 1` and a branch/location clarification.
2. Say `I love shopping`. Expect conversation without a proposal. Then `I want to do some shopping on Day 2`. Expect a valid reviewable draft when capacity/timing allow, or a specific constraint explanation.
3. If the assistant asks whether to prepare a draft, send `Yes` separately. It may prepare a proposal but must never accept it. While a draft is open, send `Make it flexible`, then an hours question. The revised draft should remain reviewable and the active version unchanged.
4. Ask `How much am I spending on Day 2, and can you replace dinner with something cheaper?` on a trip containing an identifiable dinner. Check deterministic current figures, separately labeled validated proposed figures, and no mutation before acceptance. A failed replacement should retain a valid cost answer.
5. Ask if a Namba shopping stop fits nightlife plans. Expect tentative geographic advice, not guaranteed zero travel time, verified routing or precise durations.
6. Accept/reject with the review controls; refresh; undo and restore through History. Questions, conversational confirmations and failed components must not create versions. Do not accept a superseded/stale proposal.

Latest free mock-mode browser checks: three-day Osaka trip with varied interests; 15-day form rejected; natural Day 2 shopping proposal; pending refinement from 30 to 15 minutes; superseded draft labeled stale; hours question preserved the pending draft; explicit acceptance created Version 2. Refresh, undo and restore retained the expected snapshots. Mobile (390 x 844) refreshed an unaccepted removal draft, rejected it, then retained Version 2 through typical-Tuesday hours and Day 1 follow-up messages and another refresh. Desktop (1440 x 1000) and mobile scroll widths equaled viewport widths; no runtime errors, only the unchanged form-image LCP priority warning. Controlled provider/component tests cover mixed results and malformed components, which the sample language fixtures cannot faithfully simulate. No paid model requests/evaluations were run. AI-mode server is restored afterward without editing private credentials.

### Conversation-first redesign

1. Say `I love shopping`, then `Dotonbori sounds interesting`. Expect useful discussion, no unwanted proposal or new version.
2. Ask `Which Don Quijote branch should I go to?`, then `Dotonbori`, then `I would like to visit that one`. Expect contextual discussion and an offer, not automatic insertion. Branch existence, geography and hours remain unverified.
3. Say `I want to do some shopping on Day 1` or `Add shopping to Day 1`. Expect a reviewable valid proposal or a specific capacity/schedule explanation, not internal-operation terminology.
4. Ask `Can we make Day 2 more fun?` and separately run `Make my itinerary better` / `Day 1` / `Fewer activities`. Check relevant context and targeted proposals.
5. Ask about GU closing hours, then `On Day 1`. Expect honest uncertainty, no edit or repeated notice. Try a location correction too.
6. Discuss two alternatives, then `the second one`; change your preference. Expect current conversation interpretation, with focused clarification only when genuinely ambiguous.
7. Request a cost calculation alongside a change. Check separately labeled current/hypothetical/proposed figures. Before acceptance, active versions must remain unchanged. Accept/reject, undo/restore and refresh; discuss or refine a pending proposal without accepting it implicitly.

The model now decides conversational meaning without lexical edit authorization. Mistaken proposals or inaccurate argument extraction remain possible; deterministic application controls validate action structure, arithmetic and acceptance, not every semantic interpretation. No paid evaluations or measured conversational-quality results are claimed. The existing single-interest mock generator may repeat activity names; strict editing correctly rejects an addition to such a day. Varied-interest samples exercise valid additions without weakening the duplicate-name validator.

### Earlier regression checklist

1. Ask `Can you change my budget to 500 dollars?`, then `Just an overall budget please.` Expect an unsupported-setting explanation, never a hypothetical calculation or new version.
2. Ask `Can I change my destination to Tokyo?` Expect guidance to create a new itinerary, with the current trip unchanged.
3. Ask `Make my itinerary better`, then `Day 1`, then `Fewer activities`. Expect focused clarification followed by a reviewable Day 1 proposal. Also test `I want Day 1 to be relaxing` directly.
4. Ask to replace a uniquely named activity; answer the replacement-preference clarification with `Shopping`. If several activities match, expect a target clarification rather than an arbitrary choice.
5. On a three-day trip ask `Is Eaton Centre open on Day 4?`, then `Day 3`. Expect an invalid-day explanation followed by honest hours uncertainty, never a claimed opening time.
6. Ask about museum etiquette. Expect general conduct advice and unverified venue policies, not invented photography/food rules.
7. Check that removals/reschedules have no generic uncertainty notice, while new activity recommendations retain disclosure. Accept/reject, undo/restore, and refresh; confirm informational and unsupported requests never create versions.
8. Ask `When does GU close?`, then `on day 1`, then `in Namba` separately. Expect an honest hours limitation, no edit proposal, and no redundant generic uncertainty notice.
9. Try `When does donqi hote close?`, `When does donki close?`, and an ambiguous name such as `Sunrise`. Expect cautious interpretation or focused business/branch clarification without verified existence/hours claims.
