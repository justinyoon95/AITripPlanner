# Phase 2 verification

## Automated checks

Verified locally with Node 22.5.1; use the recommended Node 22.13+ for development to satisfy lint-tooling engine requirements.

- 75 tests pass across 9 Vitest files. All OpenAI calls use mocks; no API credits consumed.
- ESLint, strict TypeScript, Prettier, and optimized production build pass.
- Production audit: zero advisories. Full audit: five existing high-severity development-only findings in the Next ESLint `braces` dependency chain; documented in README.
- Generated client chunks contain no matches for OpenAI API credentials, provider URLs, or SDK helper imports.

## Browser regression checks

Performed through the Codex browser's Playwright controls and visual screenshots. These are manual regression checks, not a committed Playwright test runner.

| Scenario                                                                            | Result |
| ----------------------------------------------------------------------------------- | ------ |
| Landing page branding and navigation to form                                        | Pass   |
| 15 inclusive days rejected in form                                                  | Pass   |
| 14-day moderate mock preview: 14 days, 42 activities                                | Pass   |
| Refresh retains preview and day count                                               | Pass   |
| Desktop itinerary at 1440 x 1000: no horizontal overflow                            | Pass   |
| Mobile form/itinerary at 390 x 844: no horizontal overflow                          | Pass   |
| Mobile one-day EUR relaxed trip: 1 day, 2 activities                                | Pass   |
| Missing-preview empty state and return-to-form link                                 | Pass   |
| AI mode with deliberately blank key: actionable error, stays on form, retry enabled | Pass   |
| Missing-key error never saves a mock fallback                                       | Pass   |

Explicit development mock mode exercised the real HTTP route without provider calls. AI overview, additional costs, over-budget presentation, provider responses/errors, and AI preview identity persistence are covered by automated mocked tests. Corrupt and legacy stored previews are covered by storage tests, not browser mutation.

## Remaining release verification

No real OpenAI provider smoke test was performed. Configure a private `.env.local` key, billing, and `TRIP_GENERATION_MODE=ai`; restart the server and generate a one-day itinerary first. Verify personalized recommendations, full cost breakdown, overview/assumptions/warnings, and refresh persistence. Model factual accuracy still requires external verification. Before public deployment, add durable server-side rate/abuse/spending controls.
