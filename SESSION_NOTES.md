# Running Go - Session Continuity Notes

Use this file to resume work in a fresh session.

## Project Snapshot

- Framework: Next.js App Router + React 19 + TypeScript
- API: tRPC + Prisma + NextAuth (guest fallback enabled)
- Styling: Tailwind + shadcn/ui
- Maps: Mapbox static images (path overlay)

## Key Decisions Already Implemented

- **Matching algorithm**: P90 distance + coverage score with thresholds in `src/lib/path-matching.ts`
- **Collection rules**: creator runs do NOT count as collection; reason returned
- **Guest mode**: main flows are public; guest user auto-created
- **Home data**: `home.summary` provides stats + recommended/popular with waypoints for map previews
- **Map previews**: explore list + home use static map path overlay; padding=60; quality=70
- **UI**: glassmorphism theme; skeletons are neutral gray (no orange flash)
- **Navigation**: bottom nav hidden on `/run` and `/courses/[id]`

## Important Files

- `TECHSPEC.md` (current spec, defaults, maintenance scripts)
- `SESSION_NOTES.md` (this file)
- Matching: `src/lib/path-matching.ts`
- Collection: `src/server/routers/collection.ts`
- Home API: `src/server/routers/home.ts`
- Home UI: `src/app/page.tsx`
- Courses list: `src/app/courses/page.tsx`
- Course detail: `src/app/courses/[id]/page.tsx`

## Maintenance Scripts

- `npm run prune:run-paths` (clear run paths older than 6 months)
- `npm run prune:guest` (clear guest data older than 90 days)

## Recent UX Fixes

- Removed global loading overlay to avoid double-loading
- Course detail now uses static map image (no Mapbox GL)
- Skeletons no longer use accent color

## What Needs Restart

- Server changes require `npm run dev` restart
- tRPC router additions (e.g., `home.summary`) require restart

## Known Issues / Things to Watch

- If orange flash appears, it was previously from skeleton accent color (now fixed)
- Home uses static map images; ensure `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` set

## Commands

- Dev server: `npm run dev`
- Lint: `npm run lint`
- Build: `npm run build`
- Start: `npm run start`
