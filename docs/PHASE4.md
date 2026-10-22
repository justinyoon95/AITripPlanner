# Location-aware itineraries

## Scope and baseline

Isolated worktree on `codex/location-aware-itineraries`, from `origin/main` at `7f181d6` (includes merged PRs #7-9). Baseline: 580 tests across 36 files passed before edits. Original checkout and all existing worktrees, including its seven uncommitted stabilization files, are preserved. Finalization authorizes a local commit after verification only; no push, PR, deployment or paid API requests are authorized.

## Provider decision and evidence

Live geocoding is **not enabled**. No credentials or dependencies were added. MapTiler's [search/geocoding API](https://docs.maptiler.com/cloud/api/geocoding/) supports POI search, bounding boxes and feature identifiers, but [pricing](https://www.maptiler.com/cloud/pricing/) counts geocoding requests against plan usage. Its [Cloud terms](https://www.maptiler.com/terms/cloud/) restrict free use and proxy arrangements; durable result storage/licensing and the account's exact allowance must be reviewed before approving a live adapter. The existing browser map key is not silently reused to authorize geocoding or bypass domain restrictions. No live MapTiler, Unsplash or OpenAI calls are made during tests/QA.

The initial offline resolver uses a deliberately small, application-bundled reference catalog, **not global geocoding**. It covers only three Osaka places. Structured coordinates are transcribed from Wikidata P625; Wikidata structured data is [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing). Reference pages reviewed during development:

| ID                                                 | Place                   | Wikidata latitude / longitude | Precision |
| -------------------------------------------------- | ----------------------- | ----------------------------- | --------- |
| [Q321242](https://www.wikidata.org/wiki/Q321242)   | Osaka Castle            | 34°41'14"N, 135°31'33"E       | POI       |
| [Q1375103](https://www.wikidata.org/wiki/Q1375103) | Universal Studios Japan | 34°39'36"N, 135°25'48"E       | POI       |
| [Q964876](https://www.wikidata.org/wiki/Q964876)   | Dotonbori               | 34°40'7"N, 135°30'5"E         | District  |

Catalog version: `wikidata-osaka-2026-10-21-v1`. Coordinates represent reference points, not verified entrances. Public reference-document browsing is not a runtime geocoding integration. Source review does not establish live existence, opening hours, booking availability or positional survey accuracy. No verification timestamps or sources are fabricated by the model.

## Location contract and trust

Optional activity `location` is a strict union with legacy and provider-reference records:

- `resolved`: source `wikidata_offline`, verification `reference_matched`, catalog version, place ID/name, city ID, POI/district precision and finite bounded coordinates.
- `resolved`: source `provider_reference`, provider-namespaced `placeId` (`provider:recordId`), place name, city ID, precision, coordinates and provenance (provider, record ID, dataset version, HTTPS reference URL and attribution links). The schema verifies namespace consistency; it does not authorize a marker by itself.
- `unresolved` / `ambiguous`: no coordinates, source `none`, bounded reason (`not_found`, `wrong_city`, `ambiguous`, `invalid_result`, `provider_unavailable`).

Matching is conservative exact normalized identity or explicit catalog aliases, not substring/fuzzy guessing. City ID and country must match the resolved destination. City-level results are rejected for activity resolution; an 80 km distance sanity bound rejects gross coordinate errors but is not an administrative boundary proof. Ambiguity remains unresolved rather than selecting the first result. A district match never stands in for a restaurant or attraction with a different name.

`selectPlace` retains the offline compatibility path. `LocationProvider` separates asynchronous candidate search from synchronous trusted-reference lookup; `selectProviderPlace` validates at most ten candidates, exact identities, city/country, feature precision, coordinates, namespace and agreement with the adapter's trusted evidence. `resolveWithProvider` returns safe failure results; there is no network implementation or automatic retry. `verifiedLocation` dispatches to configured provider evidence rather than requiring every location to exist in the bundled catalog. Missing adapters/evidence, tampered metadata, stale versions and ambiguous results produce no marker. A client/model-supplied resolved flag, stable-looking ID or plausible coordinate is insufficient.

`configuredLocationProviders` is deliberately empty: only the legacy offline resolver is active. Tests inject synthetic trusted adapters to demonstrate non-Wikidata IDs without live services. Future adapters must be configured in application code, not accepted from browser payloads; they must acquire/validate source evidence and meet storage/licensing rules. Evidence lookup during rendering/replay must not perform network requests. A lost reference cache makes a location unresolved, not automatically trusted. This is consistency checking against application-owned evidence, not cryptographic authentication of browser storage.

## Generation and structured editing

OpenAI wire activity schemas still exclude locations and duration provenance. Generation assigns stable IDs, reference-matched locations (or explicit unresolved results) and `ai_estimate` duration provenance after parsing. Development mock generation labels duration source `unknown` and does not pretend illustrative activities are actual places.

The existing single chat call receives compact place planning profiles alongside current input, current activities and bounded chronological context. It cannot author a verified coordinate, independently referenced minimum or `user_provided` duration. New additions/replacements are independently resolved during normalization before ordinary edit-engine validation. Replacement cannot retain another attraction's location or minimum evidence, even though the planned-entry ID remains stable. Unchanged activities and unrelated metadata remain untouched; time-only rescheduling preserves duration provenance. When the AI changes a duration, an existing source is changed to `ai_estimate`; legacy absent provenance stays absent for replay compatibility. Same-day aliases resolving to the same place are rejected as duplicates.

New provider proposals replay deterministically on the client using the same offline catalog. No-op comparison ignores provenance-only enrichment, so identical activities cannot become edits merely because evidence was added. Valid arithmetic survives rejected proposals through the existing partial-failure pipeline. Explicit review acceptance, fingerprints, revision checks, immutable versions and cross-tab storage rules remain authoritative; no new auto-accept or paid repair call exists.

## Duration and geographic semantics

`durationMinutes` retains its existing integer-minute meaning and bounds. Optional `durationSource` distinguishes `ai_estimate`, `user_provided` and `unknown`; the current chat path only assigns AI estimates, not user provenance based on model claims. Legacy absence means unknown provenance, not a verified duration. There is no new direct duration-entry UI in this milestone.

Optional `minimumDuration` stores independently evidenced minutes separately from the planned `durationMinutes` and its `durationSource`. It carries `independent_reference` basis and source provenance, must agree with trusted resolver evidence, and cannot be emitted by OpenAI wire operations. Merely storing this field does not make it authoritative. A trusted source's minimum remains enforceable even if the stored field is removed or altered. No real independently evidenced minimums are supplied by the current catalog; synthetic fixtures exercise this extension point.

Overlaps, end-of-day bounds, flight availability and explicit hotel movement buffers continue to use existing deterministic validation. Hotel policy times remain opening/deadline metadata, never fixed appointments. The offline reference catalog supplies a generic `full_day` planning profile for Universal Studios Japan by stable identity, not attraction-name keyword tests. Its six-hour allowance is an explicit conservative application policy, **not a sourced/verified minimum visit length**, and is sent to the model as `planningAllowanceMinutes`, never as `minimumDuration`. New generation or edits below this allowance receive an actionable error. Longer proposals must still fit all intervals and explicitly declare any supported changes; unrelated activities are never silently removed. Unknown places may have unknown visit requirements; there is no global duration database.

Geographic review uses Haversine straight-line distances between consecutive reference-matched activities. Gaps >=5 km produce advisory text that explicitly states route, travel time and feasibility are unverified. The threshold is an urban planning heuristic, not proof that an itinerary is impossible. There are no routes, transit estimates, traffic APIs or automatic optimization.

## Map and interaction

`ItineraryMap` filters markers by stable day/activity IDs and uses the existing `DestinationMap` MapLibre component. Only reference-matched points become activity markers; unresolved entries are listed and have disabled map-focus controls. If there are no activity points, the existing destination overview is context only, not an invented attraction marker.

The day selector fits known points. Activity controls focus the corresponding marker; native button markers highlight/scroll to the corresponding activity and expose safe text details and a Wikidata reference link. District precision is disclosed. Reduced-motion preferences disable camera/scroll animation. Focus is retained when marker DOM is updated.

The existing compact/expanded dialog transfers a single canvas and map instance; resize observation, Escape, focus restoration, keyboard controls, mobile layout and offline fallback are preserved. Trip creation's destination map/photos retain their current behavior. No extra geocoding, photograph or tile requests are initiated by activity resolution.

MapTiler attribution was checked against its [official MapLibre guidance](https://docs.maptiler.com/guides/map-design/attribution/add-attribution/) on 2026-10-22. With a configured map key, a single bottom-left MapLibre control displays the official hotlinked logo with a MapTiler link (required for Free plans). It travels with the canvas into the expanded dialog. Source text attribution remains enabled and expanded (`compact: false`), including the style's MapTiler/OSM credit. Offline-only maps do not load the logo; configured maps keep the notice if tiles fail. Mock tests verify DOM behavior and configuration, not live provider availability or account/production approval. The logo is one public static asset request, not a geocoding call.

## Persistence and compatibility

All new activity fields are optional without defaults. Existing snapshots, IDs, version input equality and storage keys/schema versions remain unchanged; no destructive migration or automatic enrichment on read. Historical short full-day entries remain readable and display a concern rather than destroying a stored trip. Newly proposed duration changes are checked. Old pending operations without metadata preserve their replay shape; strict candidate/fingerprint checks continue to catch tampering or stale proposals. Catalog changes may make an older pin unresolved, but do not rewrite the stored itinerary or invent evidence.

Browser storage is user-controlled: provenance checks provide consistency with bundled records, not authentication or cryptographic authenticity. Malformed domain metadata is subject to existing schema validation; runtime resolver failures yield an unresolved location without discarding the activity.

The new fields have no defaults; legacy Wikidata locations, snapshots, storage keys and ordinary pending proposals retain their exact serialized shape. Namespaced provider records can be loaded without enabling a provider, but cannot yield pins without configured trusted evidence. Minimum-duration enrichment is ignored by semantic no-op comparison. No snapshot is migrated on read. Pending candidates are always revalidated: a candidate produced under obsolete duration-source behavior may require a new review instead of silently rewriting its recorded candidate/fingerprint.

## Verification and manual QA

New deterministic tests cover exact aliases, unknown/incorrect-city names, ambiguity, city-level/invalid coordinates, unavailable adapters, forged stored evidence, activity markers by ID, replacement invalidation, no-op behavior, full-day duration conflicts, flight/hotel windows, accepted/rejected/stale versions, undo/restore and legacy records. Map tests cover day changes, bidirectional selection, cleanup, reduced-motion camera settings and initialization failure. Existing editor tests mock only WebGL rendering (tested separately); their loading, acceptance and storage assertions remain intact.

Browser smoke test (development mock mode, no private environment file):

1. Generate Osaka with future dates and Culture/Shopping interests. Confirm unresolved sample activities have no activity pins.
2. Ask `Replace one activity on Day 2 with Osaka Castle`. The deterministic sample editor supports exact catalog names for this workflow. Review then reject; no version/pin should change.
3. Repeat and accept. Confirm reference-matched pin/details, activity-to-marker focus, marker-to-activity highlight and day switching.
4. Ask for a Universal Studios Japan replacement in the short slot. Confirm the full-day allowance explanation and unchanged active itinerary.
5. Undo/restore and reload; inspect metadata and version preservation. Check compact/expanded map, Escape/focus, one canvas, desktop/mobile overflow and unresolved indicators.

Final verification (2026-10-21):

- `npm test`: 615 tests passed across 38 files. An earlier run concurrent with dev compilation hit six existing five-second test timeouts; the complete rerun with the dev server stopped passed without changing test timeouts or assertions.
- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`, and `git diff --check`: passed.
- Actual mock-mode browser checks at 1440 × 900 and 390 × 844: generated a trip, rejected then accepted a replacement, focused/highlighted the reference-matched marker, rejected a short full-day replacement, undid/restored versions, and refreshed with metadata intact. Compact/expanded views retained one canvas; Escape restored focus and background scrolling. No horizontal overflow or browser errors were observed.
- Browser QA used the offline basemap and disabled destination-photo API access. It does not establish live tile/provider availability or real OpenAI recommendation quality. No paid model or live geocoding requests were made.

Architecture-review refinement verification (2026-10-22):

- Targeted resolver, duration, attribution, map and versioning run: 100 tests passed across five files.
- Final `npm test`: 641 tests passed across 39 files (26 additional tests over the previous 615-test baseline).
- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`, and `git diff --check`: passed. No tests were weakened or removed.
- New coverage includes namespaced non-catalog records, unknown/untrusted adapters, forged evidence, stale versions, unsafe reference URLs, wrong-city/country and ambiguous results, independent minimum provenance versus planning policy, time-only rescheduling, proposal acceptance/reload/undo/restore, and one linked MapTiler logo retained across dialog expansion and tile failure. Attribution tests mock MapLibre and never fetch tiles or the logo.
- This refinement did not rerun live-provider browser QA or make model/geocoding/tile API requests. Previous offline browser observations above remain historical results, not a claim of fresh live-provider verification.
- Credential/private-file scan found no secrets in the 26 changed/untracked files. The original checkout's seven stabilization file hashes and worktree state remain unchanged. Nothing was staged, committed or pushed.

Final offline acceptance review (2026-10-22):

- Reviewed all 26 changed files for scope, credential exposure, safe rendering, trusted location evidence and legacy/proposal compatibility. No significant issue requiring a stop was identified.
- Fresh browser QA at 1440 × 900 and 390 × 844 generated an Osaka sample itinerary, rejected then accepted a replacement, switched days, selected the same activity by marker and activity controls, undid/restored, and refreshed with the restored location and version history intact. Initial generic activities remained unresolved without fabricated activity markers.
- Keyboard marker activation, native-dialog focus containment, Escape close/focus restoration, background scroll locking, one-canvas transfer and desktop/mobile dimensions were checked. There was no horizontal overflow; captured browser error logs were empty. At city zoom the offline basemap is a geographic reference surface, not a street map.
- Configured-mode logo/link, source-attribution configuration, dialog transfer and tile-failure behavior passed deterministic mocked tests. No configured live tile requests were made; live attribution rendering and provider/account compliance remain outstanding, not implied by mock tests.
- Targeted safeguards: 100 tests across five files passed. Full suite: 641 tests across 39 files passed; lint, TypeScript, formatting, production build and whitespace checks passed.
- README reviewed: current offline coverage, uncertainty, configuration and attribution limitations are accurate; no public roadmap or milestone content was added. No live geocoding or paid model evaluations were run.

## Limitations

Coverage is three references in one city with conservative exact aliases. Most real itineraries remain unresolved until an approved broader provider/dataset is integrated. No live geocoding, entrances, venue policy checks, route times, general attraction-duration database, bookings, accounts, cloud storage or full reoptimization. These are honest initial offline location capabilities, not worldwide verified itinerary feasibility. Real OpenAI behavior is not established by mocked tests, and no paid evaluation is run.
