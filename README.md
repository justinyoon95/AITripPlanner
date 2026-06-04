# AI Trip Planner

AI Trip Planner is a portfolio-focused full-stack application for generating,
previewing, and saving personalized travel itineraries.

## Current Status

Phase 0 is in progress:

- Next.js 15 App Router
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui setup
- Zod validation foundation
- React Hook Form dependency
- Vitest unit test setup

The full technical design lives in
[`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md).

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Useful Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Architecture Direction

The MVP will use:

- GitHub and Google OAuth through Auth.js
- Neon PostgreSQL with Prisma
- Server Actions for authenticated mutations
- Route Handlers for AI preview generation
- OpenAI structured output validated with Zod
- Versioned itinerary history for regenerations

