# Running Go Tech Spec (Current State)

This document captures current technical decisions and defaults. It also lists the
remaining spec items to lock down before launch.

## Stack

- Framework: Next.js App Router
- Client: React 19 + TypeScript (strict)
- API: tRPC
- DB: Prisma + Postgres
- Auth: NextAuth (currently permissive, guest fallback)
- Styling: Tailwind + shadcn/ui
- Maps: Mapbox (static images for previews)

## Core Decisions (Implemented)

### Matching Algorithm

- Location: `src/lib/path-matching.ts`
- Inputs:
  - Course waypoints (stored in DB)
  - User path (GPS points)
- Pre-processing:
  - Path densification (`DENSIFY_STEP_METERS = 8`)
  - Simplification using the same distance step
- Scoring:
  - Distance: P90 of nearest-point distances
  - Coverage: ratio of points within `TARGET_MATCH_DISTANCE_METERS = 60`
  - Final score = distance 45% + coverage 55%
- Threshold:
  - `MIN_MATCH_RATE = 90`
  - GPS accuracy filter: 20m
  - GPS sampling interval: 3 seconds

### Collection Rules

- A course counts as collected only if:
  - Match is valid AND
  - The runner is NOT the course creator
- Effects:
  - Creator runs do NOT increase collection count
  - Creator runs do not add to “My Collection” list
  - Result reason: “제작한 코스는 수집되지 않습니다”

### Guest Access

- Login requirements are disabled for main user flows
- `guest` user is auto-created when no session exists
- Affects:
  - Collection
  - Likes
  - Run sessions
  - Home stats (uses guest if unauthenticated)

### Home Data Source

- API: `home.summary`
- Stats (monthly):
  - distance (km sum)
  - duration (seconds sum)
  - collection count (excluding self-created courses)
- Recommended & Popular:
  - Sorted by like count (`likes._count`)
  - Returns `waypoints`, `centerLat`, `centerLng` for map previews

### Profile Data Source

- API: `profile.summary`
- Stats:
  - created courses
  - collected courses (excluding self-created)
  - run count, total distance, total duration
 - Tier:
   - 9 levels based on collected unique courses
   - thresholds: 1, 5, 15, 35, 70, 120, 200, 350, 500

## UI & UX Behavior (Implemented)

### Global Navigation

- Bottom navigation (Toss-style) is always visible except:
  - `/run` routes
  - `/courses/[id]` (to avoid overlapping bottom CTA)

### Back Navigation Rules

- Run result actions use `router.replace()`
  - Prevents returning to the result screen on back
- Collection page back always returns to Home

### Loading

- No global loading overlay
- Page-level skeletons use neutral gray

## Operational Defaults (Implemented)

### Map API Usage

- Static map images are rendered client-side using Mapbox Static Images API
- No server-side caching is implemented
- Default sizes:
  - List cards: 640x360
  - Detail hero: 900x520
- Path overlay width: 4–5px
- Current padding for path overlays: `padding=60`
- Caching relies on browser cache (no explicit cache headers)
- Image quality capped at `quality=70` for static maps
- Map request budget: 60 static map requests per session (client-side limiter)

### Data Retention

- Raw GPS path: 6 months
- Keep aggregated stats (distance, duration, pace) indefinitely
- Deletion strategy: scheduled job (monthly) to clear `RunSession.path` via `npm run prune:run-paths`

### Anti-cheat / Data Quality

- Applied filters (server-side):
  - GPS accuracy filter (`DEFAULT_MAX_ACCURACY = 50`)
  - Max speed filter (`MAX_SPEED_MPS = 7`)
  - Jump filter: `MAX_JUMP_METERS = 120` within `MAX_JUMP_TIME_SECONDS = 5`
- Notes:
  - Filters are applied before matching and before storing free-run paths

### Guest Policy

- Guest data is not merged automatically
- On login: keep separate unless a merge flow is explicitly added
- Optional cleanup: remove guest data older than 90 days via `npm run prune:guest`

### Caching & Refresh

- React Query defaults:
  - `staleTime = 30s`
  - `refetchOnWindowFocus = false`
- Like toggle invalidates:
  - `course.byId`
  - `course.list`
  - `home.summary`
  - `ranking.list`

### Error UX

- Network errors: inline message + retry button
- Auth errors: inline message (no redirect when guest mode on)
- Validation errors: show field-level error where possible
- Shared `ErrorState` component used for common list/detail screens

### Accessibility / Mobile

- Minimum tap target: 44px
- Respect iOS safe area for fixed bars (`padding-bottom: env(safe-area-inset-bottom)`)
- Avoid fixed overlays covering primary CTA

## Map Previews (Static Images)

- Explore list and Home (recommended/popular) show map snapshots with path overlay
- Uses `centerLat/centerLng` fallback when path missing

## Files of Interest

- Matching: `src/lib/path-matching.ts`
- Collection logic: `src/server/routers/collection.ts`
- Home API: `src/server/routers/home.ts`
- Course list maps: `src/app/courses/page.tsx`
- Home maps: `src/app/page.tsx`
- Course detail: `src/app/courses/[id]/page.tsx`
- Skeleton styling: `components/ui/skeleton.tsx`

## Maintenance Scripts

- `npm run prune:run-paths` (clear old run paths)
- `npm run prune:guest` (clear old guest data)
