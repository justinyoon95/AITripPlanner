# AI Trip Planner

# About
This is an AI-powered Trip Planner designed to generate Travel plans according to your needs. More details coming soon.

## Getting Started

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

Before authentication and database-backed features work locally, fill in `.env`
with:

- `DATABASE_URL` from Neon PostgreSQL
- `AUTH_SECRET`
- Google OAuth credentials
- `OPENAI_API_KEY` for itinerary generation later
- Optional `OPENAI_MODEL` override for itinerary generation

To test itinerary generation without an OpenAI API key, set:

```bash
DEMO_MODE="true"
```

Demo mode returns deterministic sample itineraries that still use the same
validation, preview, and save flow as real AI-generated itineraries.

## Useful Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run db:generate
npm run db:migrate
npm run db:studio
```

## Current Milestone

The project now has the database, authentication, and saved-trip foundation:

- Prisma schema for Auth.js users, accounts, sessions, trips, itineraries, days,
  activities, and preferences
- Auth.js configured with Google OAuth
- Protected dashboard and trip creation routes
- Server-side `requireUser()` helper for authenticated data access
- React Hook Form and Zod trip creation flow
- Saved trips dashboard
- Trip detail page
- Trip deletion flow
- OpenAI structured itinerary preview flow
- Confirmed previews persist as versioned itinerary records
- Demo itinerary mode for local testing without OpenAI credits
