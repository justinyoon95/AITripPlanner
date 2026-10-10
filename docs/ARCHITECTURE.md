# Frontend foundation design

## Repository inspection

The previous implementation used Next.js 15, Prisma, Auth.js, and OpenAI. This frontend foundation was developed in a separate workspace to preserve the previous checkout and its uncommitted changes. The redesign replaces those integrations with a standalone mock-data prototype; previous implementation history remains available in Git.

## Scope and decisions

- App Router with strict TypeScript, Tailwind 4, and a small shadcn-style button primitive. Avoid installing a component CLI or a large UI library until the product needs them.
- React Hook Form manages input state; Zod is the runtime contract and source of TypeScript types. Validate at submission and browser-storage boundaries.
- Server components own routes, static content, and metadata. Client components own form state and browser storage. There are no server actions or API routes in phase 1 because there is no server persistence or generation.
- `TripInput` captures destination, dates, positive budget, supported currency, interests, pace, and optional notes. Budget uses numbers in major currency units for illustrative frontend estimates; use integer minor units or database decimals and explicit currency precision when real financial calculations arrive.
- `Itinerary` contains a stable ID, mock source, creation timestamp, input snapshot, and ordered days. Each activity has a stable ID, category, time, duration, and estimated cost. A future chatbot should target IDs rather than names or array positions.
- UTC date-only arithmetic prevents daylight savings from changing the number of trip days. A centralized 14-day constant limits work and rendering; expand it alongside performance and generation constraints later.
- Local storage enables refreshing and reopening a preview on the same browser. Keys are namespaced and versioned; stored data is untrusted and revalidated. This is not account persistence or a shareable trip link.
- Mock generation uses selected interests and 2/3/4 daily activities for relaxed/moderate/packed trips. A rough portion of the input budget is distributed across activities; this is not a cost prediction. Free-text preferences are displayed without pretending to enforce them.

## Data flow

1. Server renders landing page and `/trips/new`.
2. Form validates with the shared Zod schema.
3. Pure mock generator constructs and validates an itinerary.
4. Browser storage writes the preview; navigation opens `/trips/<uuid>`.
5. Loader reads and validates the preview, then presentation components render overview, day activities, cost totals, and preferences.
6. Missing storage shows an empty state; invalid/inaccessible storage shows an actionable error. No external requests occur during generation.

## Future evolution, pending approval

1. Improve prototype through usability review and browser end-to-end tests.
2. Define itinerary versioning and structured edit operations: replace/add/remove activity, adjust day, and change budget. Validate edits and preserve unaffected IDs.
3. Add Supabase PostgreSQL and Auth with row-level security and ownership checks. Move persistence behind a server boundary and migrate the preview contract.
4. Add OpenAI structured generation, timeouts, usage controls, and validation beyond JSON shape. Keep generation logic out of UI components.
5. Build the stateful chatbot around validated edit proposals, user confirmation, immutable versions, and conversation state. Test that edits preserve unaffected days.
6. Add verified place data, maps, richer cost models, and Vercel deployment as separate milestones.

No future integration dependencies are installed in phase 1.
