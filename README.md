# TripPlannerAI

Phase 1 is a functional frontend prototype. It includes a responsive landing page, validated trip form, and day-by-day sample itinerary with activity duration and cost summaries. No API keys, sign-in, or database setup are required.

## Run locally

Use Node.js 22.13+ or a current supported LTS release.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Next.js. Create a trip at `/trips/new`; submitting opens `/trips/<preview-id>`.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

## Architecture

```text
src/
  app/                       App Router pages, metadata, loading and error boundaries
  components/
    ui/                      shadcn-style shared controls
    trips/                   Form, preview loader, itinerary presentation
  features/trips/
    schema.ts                Zod input and itinerary contracts
    types.ts                 Types inferred from schemas
    mock-data.ts             Sample activity templates
    mock-generator.ts        Pure itinerary generation and cost summaries
    storage.ts               Validated browser persistence
    format.ts                Currency and timezone-safe date formatting
  lib/utils.ts               Class-name composition
tests/                       Validation and domain logic tests
docs/ARCHITECTURE.md          Decisions and phased roadmap
```

Pages remain server components. React Hook Form and Zod power the interactive form. The browser preview loader reads local storage and passes validated data to the itinerary view. A future generation service can return the same itinerary structure without rewriting activity/day components.

## Prototype limitations

- Activities and prices are illustrative templates, not verified destination recommendations. Selected interests and pace affect the preview; free-text preferences are retained but not interpreted.
- Costs are in the selected currency. There is no currency conversion or real-world pricing model. Flights, lodging, and transportation are excluded.
- Preview data stays in this browser's local storage. Links cannot be shared across devices. Clearing site data removes previews. Avoid sensitive information in preferences on shared devices.
- Trips are limited to 14 inclusive days via one domain constant. Past dates are allowed for prototype exploration.
- Photographs load from Unsplash over the network. Layout and functionality do not depend on successful image loading.
- No OpenAI, Supabase, authentication, map, or chatbot integration is installed.

## Dependency checks

The initial critical test-runner advisories were resolved by updating Vitest. The npm audit currently reports five high-severity development-only findings in the Next.js ESLint configuration's `braces` dependency chain. The registry offers no patched compatible `braces` release; revisit after an upstream fix. Production dependencies have no reported advisories at the time of verification. Do not use `npm audit fix --force`, which proposes downgrading the Next.js lint configuration to an incompatible major version.

## Repository hygiene

Commit application source, tests, documentation, and `package-lock.json`. Never commit real `.env` files, credentials, `.next`, `node_modules`, or `.vercel` state. No secrets are required for this milestone.

## Next milestone

Review the form and itinerary contract, then design stable itinerary versions and explicit activity-edit operations for the future conversational editor. Implementation of future phases requires approval.
