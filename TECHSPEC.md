# Running Go Tech Spec (Current State)

This document captures current technical decisions and defaults. It also lists the
remaining spec items to lock down before launch.

## Stack

- Framework: Next.js App Router
- Client: React 19 + TypeScript (strict)
- API: tRPC
- DB: Prisma + Postgres
- Auth: NextAuth (login required for user data/actions)
- Styling: Tailwind + shadcn/ui
- Maps: provider SDK map (`src/lib/map/sdk.ts`) + client-generated SVG previews

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
  - Coverage: ratio of points within `TARGET_MATCH_DISTANCE_METERS = 80`
  - Final score = distance 45% + coverage 55%
- Threshold:
  - `MIN_MATCH_RATE = 84`
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

### Access Policy

- User-scoped features require login:
  - Collection
  - Likes
  - Run sessions
  - Home/Profile summaries
- Unauthenticated users are redirected to login or receive UNAUTHORIZED responses.

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

### Map Usage

- Explore/Detail/Run pages render an interactive map via `loadMapSdk()` (`src/lib/map/sdk.ts`)
- Course cards/previews use client-generated SVG data URLs (`src/lib/course-preview-image.ts`)
- No server-side map tile/proxy cache layer is implemented

### Data Retention

- Raw GPS path: 6 months
- Keep aggregated stats (distance, duration, pace) indefinitely
- Deletion strategy: scheduled job (monthly) to clear `RunSession.path` via `npm run prune:run-paths`

### Anti-cheat / Data Quality

- Applied filters (server-side):
  - GPS accuracy filter (`DEFAULT_MAX_ACCURACY = 20`)
  - Max speed filter (`MAX_SPEED_MPS = 7`)
  - Jump filter: `MAX_JUMP_METERS = 120` within `MAX_JUMP_TIME_SECONDS = 5`
- Notes:
  - Filters are applied before matching and before storing free-run paths

### Account Policy

- No guest account auto-creation for user-scoped APIs.
- User data remains account-bound; no guest merge flow is used.

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
- Auth errors: inline message + sign-in guidance
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
