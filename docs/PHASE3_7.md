# Phase 3.7: Interactive destination experience

Latest placement refinement: the compact expandable map now appears immediately **above** the destination autocomplete in section 01. The order is essentials heading, map, destination input, then dates. This supersedes the below-input placement described in the earlier implementation and verification snapshots below; expansion, destination synchronization and photo behavior are unchanged.

## Isolated baseline

Development uses `codex/destination-experience` in a managed worktree at `/Users/justinyoon/.codex/worktrees/destination-experience/TripPlannerAI`, based on freshly fetched `origin/main` at `f68ad1e` (merged PR #5). Local `main` was still `fb85528`; it was not switched or rewritten. The original `feat/trip-planning-experience` checkout and its seven uncommitted stabilization files remain separate and untouched. Those post-merge fixes are deliberately not bundled into this review. No commits, pushes, PR changes, merges or deployments are performed here. Baseline verification: 433 tests across 29 files passed.

## Architecture

- `TripForm` owns validation and the most recent confirmed visual destination. `TripPlanningExperience` uses a header render slot before the form for the single hero photo and a destination render slot immediately beneath destination autocomplete, before dates, for the map. Both receive exactly the same projection, with no independent city selection. Typing invalidates the trip's resolved metadata but keeps the last confirmed visuals; selecting a new canonical record updates both, and clearing resets both. Exact manual resolution on submission also updates the projection. Visual state is transient, not saved itinerary metadata.
- `GET /api/destination-photo?id=...&q=...` independently matches the city ID and name against bundled GeoNames. It constructs the provider query from trusted city, region and country; no browser-supplied coordinates or search URL can control provider requests.
- Server-only `destination-photos.ts` handles search, validation, relevance checks, attribution and tracking. `photo-client.ts` deduplicates browser requests and validates the returned city identity and URL origins.
- `DestinationPhoto` retains all fetching, caching, stale-result, fallback and successful-use tracking logic. Its `hero` presentation variant fills the cinematic header with an actual unoptimized image element; the default `card` variant remains reusable. A loaded city image overlays the original lake photo with the existing 350ms fade. Failed metadata/image requests leave the default visible. Credits switch to the displayed photographer and remain bottom-right; reduced motion removes the fade. Hero rendering does not mount a second photo component or make extra metadata/tracking requests.
- `DestinationMap` dynamically imports MapLibre inside a client effect. Its worker is explicitly bundled with `setWorkerUrl(new URL(..., import.meta.url))` following MapLibre 6's Next/webpack guidance. Initialization never runs in SSR. ResizeObserver, map, marker and pending initialization are cleaned up on unmount. Default view is worldwide; selection flies to canonical coordinates, updates the marker, and clearing returns to the world. Reduced motion uses zero-duration camera changes. Default keyboard/touch/pan/zoom controls and visible attribution are retained, with cooperative gestures to avoid trapping page scrolling.

No generation/chat prompts, operations, schemas, engine or persistence keys are changed. OpenAI remains independent. Future verified itinerary markers can be supplied to the map renderer as a separate typed collection; this phase uses only a city marker and never invents attraction coordinates or routes.

## Providers, licensing and setup

### Photography: Unsplash

Unsplash was selected for city/travel coverage, directly resizable CDN images and documented search/attribution behavior. Pexels was considered; its documented default quota is larger (200/hour, 20,000/month), but this small app favors conservative selection and low request volume rather than a quota-based dependency. Neither search API is unlimited or accessible without registration.

Register an Unsplash application and add to private `.env.local` in this worktree:

```dotenv
DESTINATION_PHOTOS_ENABLED=true
UNSPLASH_ACCESS_KEY=your_application_access_key
```

Keep the access key server-side; never use a `NEXT_PUBLIC_` prefix. The key is not returned by the route or included in logs. `.env.example` is now a tracked-template candidate with empty credentials; all other `.env*` files remain ignored. No private environment file was copied into the worktree.

Search uses official `api.unsplash.com/search/photos`. Captions must contain city and country evidence, with normalized case/accents/punctuation and common country abbreviations (for example, UK for GB/United Kingdom). A successful initial search without a suitable match permits one broader city/country landscape search. Both count against the existing quota; errors never trigger a fallback or automatic retry. This conservative heuristic can reject valid photos and is not proof of geographic accuracy: manually review provider quality before production. Uncertain/empty results retain the lake photo instead of labeling unrelated photography as a city. There is no tiny hardcoded city list or unofficial image endpoint.

API images are hotlinked directly via Next Image `unoptimized`, preserving returned `ixid` and other CDN parameters; no image proxy, local download or rehosting is used. Photographer/photo links include required referral parameters. When a selected image successfully becomes a hero, a same-origin POST triggers its exact provider-returned download/use endpoint through a signed token; tracking does not depend on a city search-cache entry. No image-file downloads or provider calls are made by automated tests. See [the October 13 compliance audit and remaining approval blockers](UNSPLASH_AUDIT.md).

Unsplash documents 50 JSON requests/hour in demo mode and 1,000/hour after production approval. Successful results are cached in-process for 24 hours (up to 100 cities), negative results for 5 minutes, and concurrent searches coalesce. Browser results cache for 5 minutes (up to 50 cities), errors for 30 seconds. A conservative 40-request/hour process budget includes search/tracking, with a maximum of 20 searches reserving capacity for use events, five-second timeouts and no retries. Signed usage tokens last 30 minutes and are refreshed from cached metadata without a provider call. Local photo/event idempotency lasts one hour and includes failed attempts. These caches/budgets/idempotency records are not shared across serverless instances; production needs shared abuse/rate controls and delivery evidence. Tracking can fail due to expiry/network/quota without blocking the form; confirm full usage compliance and production approval with Unsplash before release.

Sources: [Unsplash documentation](https://unsplash.com/documentation), [API guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines), [Pexels API documentation](https://www.pexels.com/api/documentation/).

### Maps: MapLibre + optional MapTiler

MapLibre GL JS 6.14.0 (BSD-3-Clause) is the only new direct runtime dependency. Coordinates already exist in validated GeoNames records, so no geocoder or geolocation permission is needed.

Without a token, a bundled Natural Earth 5.1.2 1:110m land outline provides a real interactive world/regional overview with a destination marker. It uses only same-origin assets: no public OSM tile server or paid map traffic. Offline zoom is deliberately regional (3.5), since low-resolution outlines cannot honestly provide street-level detail. It is labeled as an offline overview. This is not a replacement for city street tiles.

For city-level streets, create a MapTiler application key, restrict it to your allowed domains including the development hostname, and set:

```dotenv
NEXT_PUBLIC_MAPTILER_KEY=your_domain_restricted_browser_key
```

Restart the dev server; public env values are also inlined at build time. This token is intentionally browser-visible, not a secret. Do not put a private/admin credential here. Configuring it opts into direct browser requests for the Streets v2 style, tiles, fonts and sprites. City zoom is 11; map errors switch to the offline overview and never disable the form. If WebGL itself is unavailable, an accessible status explains that trip planning remains usable.

MapTiler's free plan is limited to personal/noncommercial use and qualifying R&D with monthly usage quotas; it is not unlimited free production hosting. MapLibre usage may count requests rather than SDK sessions. Check your current plan, usage dashboard and domain restrictions before enabling; paid-plan overages require explicit project approval. Provider attribution remains enabled. No MapTiler calls were made during verification.

Sources: [MapLibre installation/worker setup](https://maplibre.org/maplibre-gl-js/docs/), [MapTiler key restrictions](https://docs.maptiler.com/guides/credentials/api-key/), [MapTiler pricing](https://www.maptiler.com/cloud/pricing/), [MapTiler terms](https://www.maptiler.com/terms/cloud/).

Offline asset: `public/world-land.geojson`, [Natural Earth 5.1.2 source](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_110m_land.geojson), public domain ([terms](https://www.naturalearthdata.com/about/terms-of-use/)). Source SHA-256: `9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9`; bundled pretty-formatted file SHA-256: `e9582bd9f23660d57cc89437354adb681841c80dd521ac9de66c9522318f9c54`. It is coarse cartographic data, not routing or authoritative border information.

## Local review

```sh
npm ci
# No external credentials or paid calls:
TRIP_GENERATION_MODE=mock npm run dev -- --port 3001
```

Select a real city, change it, type without selecting and clear it. The map should fly and reset; without Unsplash configuration the original lake remains. With explicitly configured providers, verify photo relevance, attribution, real street rendering and failure fallback manually. No real-provider result quality is claimed from mocked tests.

Desktop has a full-width 420px cinematic hero directly below the unchanged navbar. Existing back link, eyebrow, headline and support text align to the main content container, with near-white text and left/bottom gradients independent of image brightness. Attribution has a dark backing at bottom-right. The form is a centered single column with a maximum width of 860px, beginning with “01 / The essentials”; no photo sidebar or empty grid column remains. The compact map sits immediately below destination autocomplete, before start/end dates, followed by budget and travelers. Canvas height is 260px on desktop/tablet and 200px on mobile. Mobile uses a content-aware minimum 390px hero, a naturally wrapped 36px headline, and reserved lower space for attribution; it is not a full-screen landing page. Tablet shading also preserves readability against bright photographs.

The photo hotlink is still the original provider URL with no image proxy or duplicated renderer. Hero images use the `100vw` sizing hint, but Next intentionally omits browser `sizes`/`srcset` for unoptimized direct URLs; actual responsive sizing is supplied by the cover frame. Successful-load and signed use-event handlers are unchanged. Map `heading` is a presentation-only option; no geographic or camera pipeline changed. Back-link/credit focus rings stay visible over the image.

## Verification and limitations

Automated additions cover missing credentials, official query composition, relevance rejection, attribution, caching/concurrency, forged IDs, provider failure/quota, browser stale responses, image load failure, selection/typing/clearing, map camera/markers, invalid coordinates, reduced motion, tile fallback, SSR and cleanup. Calls are mocked. Ordinary tests never access external providers or OpenAI.

Actual isolated Chrome checks at 1440x900 and 390x844 use real WebGL MapLibre and the local outline, plus intercepted photo metadata/bitmap fixtures. They verify nonblank world pixels, visible destination markers, camera transitions, synchronized city changes, unchanged visuals during typing, clearing, attribution, no horizontal overflow and no page exceptions. Screenshots use a solid-color **test fixture**, not real city photography, and are not proof of provider relevance. The default Unsplash CDN image may still load independently; this is not a paid API request.

Known limitations: no live-provider keys/results tested, no route/attraction mapping, coarse offline data, heuristic photo relevance, single-process cache/quota, WebGL dependence and serverless cold-start cost for geographic data. Existing npm advisories remain in the ESLint dependency chain (five high-severity reported entries); no forced dependency downgrade was attempted. The host Node 22.5.1 is below the documented 22.13+ development recommendation and emits an existing ESLint engine warning; use supported Node for production. Both are separate maintenance follow-ups.

## Initial implementation verification

| Command                | Result                                                                     |
| ---------------------- | -------------------------------------------------------------------------- |
| `npm test`             | 466 passed across 32 files; 33 new tests over the isolated merged baseline |
| `npm run lint`         | Passed                                                                     |
| `npm run typecheck`    | Passed                                                                     |
| `npm run format:check` | Passed                                                                     |
| `npm run build`        | Passed; all nine routes generated/compiled                                 |
| `git diff --check`     | Passed                                                                     |

Actual WebGL desktop/mobile visual checks passed in both development and locally served production builds. A separate mock-mode browser workflow passed complete optional travel generation, whole-party/seasonal metadata, logistics-only departure, proposal rejection/acceptance, undo/restore and refresh. An initial worker-load failure was caught by the real browser check and fixed through explicit worker bundling; mocked map tests alone would not have detected it. Default photography is labeled when a city photo is unavailable, so the lake is not presented as the selected city.

Production output tracing includes both geographic gzip snapshots for the photo route. The working-tree credential scan found no credential patterns among 22 changed/untracked files; private environment files are absent from this worktree. Original stabilization files remain untouched. Review screenshots: `/private/tmp/tripplanner-phase37-1440.png` and `/private/tmp/tripplanner-phase37-390.png` (mock photo fixtures). A pre-existing default-image LCP advisory remains; no browser page exceptions or layout overflow were detected in the visual checks. Provider billing/relevance and real street tiles remain untested without credentials.

## Cinematic hero refinement verification

The refinement changes only `trip-planning-experience.tsx`, `trip-form.tsx`, `destination-photo.tsx`, the map's optional presentation heading, `/trips/new/page.tsx`, scoped CSS, visual integration tests and this document. All prior uncommitted work is preserved, including the separate Phase 3.6 stabilization checkout. No AI prompts, domain schemas, edit engine, photo service, tracking token, provider quota, persistence or geographic lookup logic was changed.

Before: the heading was on a plain background and photography/map lived in a right sidebar. After: one actual image renderer fills a full-width hero under the navbar, followed by a centered form and secondary map after essentials. Header/map render slots use the same form-owned confirmed city; they never create a second photo fetcher. Inputs and validation are unchanged. The photo remains a direct original hotlink, and its signed successful-use tracking and photographer links are retained.

| Command                | Current result                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `npm test`             | 480 passed across 32 files; two new composition regressions over the audited 478-test state |
| `npm run lint`         | Passed                                                                                      |
| `npm run typecheck`    | Passed                                                                                      |
| `npm run format:check` | Passed                                                                                      |
| `npm run build`        | Passed                                                                                      |
| `git diff --check`     | Passed                                                                                      |

Actual isolated Chrome checks passed at 1440x900 and 390x844 in both development and local production builds. The real default lake photo loaded and was visually inspected for cropping, balance, readable text, credit placement and form spacing. Mock bright-white/day and dark/night images verified headline contrast of at least 3:1 for large text, non-overlapping clickable attribution, keyboard back-link focus, reduced-motion CSS, no overflow or page exceptions, map controls that do not submit the form, and exactly two photo requests/two unique use events for two city selections. Typing and clearing behaved correctly. These are fixture checks, not an app-wide accessibility certification or live-provider quality measurement.

A separate mock workflow passed optional travel generation, traveler/seasonal metadata, logistics-only departure, proposal reject/accept, undo/restore and refresh persistence. No paid API calls were made during verification. Local production serving was a check, not deployment. The original configured development server is restored afterward for manual review.

Screenshots: `/private/tmp/tripplanner-hero-1440-default.png` and `/private/tmp/tripplanner-hero-390-default.png` show the real default photograph. Corresponding `-night-fixture.png` images show test fixtures, not claimed destination photographs. Live provider image relevance/focal cropping remains a manual check; pre-existing attribution/production-approval blockers remain documented in `UNSPLASH_AUDIT.md`. No commit, push, merge, deployment or Phase 4 work was performed.

## Compact expandable map refinement

The current map is immediately beneath destination autocomplete inside section 01, before start/end dates. Its footer shows `Explore <selected city>` or `Explore your destination`, with a secondary preview label and a 44px-high expand control. Only confirmed geographic records drive the map, hero and footer. Typing without selecting preserves the last confirmed visuals; clearing resets all three. The photo renderer and Unsplash request/tracking pipeline are unchanged.

Expansion uses a native modal `dialog`, not a second map or React portal. The existing map element is moved into its expanded host and returned to its compact host on close. One MapLibre instance, canvas and marker retain camera state; expansion/collapse calls `resize()` and ResizeObserver handles subsequent size changes. The compact placeholder retains its dimensions while the dialog is open. Layout-effect cleanup restores React's original DOM ownership before unmount, disconnects native listeners and restores body scrolling; the existing map effect disposes MapLibre and its observer.

The dialog has an accessible title, focused close button, native modal background inertness, explicit Tab/Shift+Tab wrapping, Escape cancellation, background scroll lock and focus restoration to the expand button. Native keyboard/cancel/close handlers also receive events from the transferred MapLibre DOM. Compact wheel zoom is disabled and cooperative gestures preserve normal page scrolling. Expanded wheel zoom is enabled and cooperative restrictions are disabled using MapLibre 6's `cooperativeGestures` handler API. Deliberate zoom controls remain available in both modes. Reduced-motion camera behavior and offline/failure states are unchanged. This requires browsers supporting native modal dialogs, consistent with the existing modern-browser target.

Files changed for this refinement: `src/components/trips/trip-form.tsx` (slot placement), `src/components/trips/destination-map.tsx` (footer/dialog/lifecycle), `src/app/globals.css` (compact/expanded responsive sizing and tablet hero contrast), `tests/destination-visuals.test.tsx` (placement, native dialog mocks and six regressions), and this document. No generation, chat, scheduling, schema, persistence or geographic validation changes were made. The separate seven stabilization files in the original checkout remain untouched.

Final verification: `npm test` passed **486 tests across 32 files**. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` and `git diff --check` passed. Browser checks use mocked provider responses and the real offline MapLibre/WebGL renderer; no paid provider or model requests are made. Development checks at 1440x900, 768x1024 and 390x844 verified placement, 260px/200px compact heights, one canvas through expansion, camera/marker retention, native focus wrapping, Escape cleanup, restored scrolling/focus, dialog viewport fit, form usability, no overflow or page exceptions, and exactly two photo metadata requests/two tracking events for two city selections, with none from expansion. A separate mock workflow passed travel generation, party/seasonal metadata, logistics-only departure, reject/accept, undo/restore and refresh.

Browser verification caught and corrected a MapLibre version-specific gesture API mismatch, native-dialog centering overridden by the CSS reset, and tablet contrast against a bright fixture. These issues were not assumed safe based on map mocks alone. Screenshots: `/private/tmp/tripplanner-map-1440-compact.png`, `/private/tmp/tripplanner-map-1440-expanded.png`, and corresponding `768` and `390` images. City images in these screenshots are fixtures, not verified destination photographs. Real MapTiler street tiles, live Unsplash relevance and physical-device touch gestures remain manual checks; no new paid services are introduced. No commit, push, merge or deployment is performed.

The same three visual viewport checks also passed against the locally served production build, including expanded-canvas pixel checks. The production end-to-end mock-generation attempt correctly returned `Development sample mode is unavailable in production` (503) rather than calling OpenAI; it is not counted as a passing production generation test. The generation/editing workflow is verified in development mock mode only. Live production generation remains untested in this refinement.

## Finalization review: October 15, 2026

The latest user-approved placement is **above** destination autocomplete: essentials heading, compact expandable map, destination input, then dates. Earlier below-input descriptions and counts are historical verification snapshots, not the current layout. The cinematic hero and shared confirmed-destination state remain unchanged.

London's photo failure was reproduced against live Unsplash: the canonical record correctly supplied London / England / United Kingdom / GB, and the API returned HTTP 200 with 66 results and quota remaining. A relevant caption used `London, UK`, which the former literal-country filter rejected. This was not an empty search or an observed rate-limit failure. Normalized whole-phrase city/country matching now accepts standard country aliases, and one bounded broader search handles genuinely empty or unsuitable initial results without accepting generic photography. Successful results retain exact image URLs, credits and signed tracking identity. HTTP 429 stops searches across destinations for a bounded provider cooldown; transient failures are not stored as successful results, HTTP errors are `no-store`, and finite browser failure caches permit later explicit recovery. No transport retries were added.

The landing-page attribution blocker is resolved: verified Sorasak credits for Kyoto, and verified replacement images/credits for Lisbon (Claudio Schwarz) and the Dolomites (Willdwind / William Martret). New editorial selections were tracked once at curation, not on searches or every page view. See [the final compliance review](UNSPLASH_AUDIT.md) for exact photo identities, official evidence and remaining owner checks. A separate live London browser smoke test loaded city imagery, rendered Dixit Dhinakaran's attribution, and returned 200 for metadata plus 204 for one use event. Nine bounded Unsplash requests were made during investigation/curation/live verification; no OpenAI calls or paid evaluations were made.

Final automated suite: **506 tests across 32 files**, including 20 additional regressions over the approved 486-test state. Coverage adds London/UK captions, international country/city normalization, ordinary words that resemble ISO codes, empty/unsuitable initial results, broader-search success, geographic rejection, 429 cooldown and recovery, transient failure recovery, fallback tracking identity and all landing-card credits. Existing stale-response, hotlink, tracking, dialog and form regressions are retained. Desktop 1440x900, tablet 768x1024 and mobile 390x844 Chrome checks passed with mocked city photos and the offline map; landing-card credit links and mobile overflow were also checked. Development mock generation/editing/reject/accept/undo/restore/refresh workflows passed.

Review screenshots are included in [screenshots](screenshots/README.md). They use clearly labeled mocked city photography, not unverified live destination images. Live MapTiler tiles, physical-device touch behavior, Unsplash dashboard counters/registration details and production approval still require manual review. In-memory quota/cache/idempotency limits remain process-local; production-wide coordination needs a separately approved design. No authentication, database, itinerary markers, routing, deployment or Phase 4 work was added. The original checkout's seven stabilization files remain separate and untouched.
