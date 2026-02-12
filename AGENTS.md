# Agent Notes for running-go

This file is for coding agents working in this repository.
Keep changes small, follow local patterns, and verify behavior before finishing.

## Session startup

- Always read `SESSION_NOTES.md` first to resume current priorities.
- Check `TECHSPEC.md` when a product rule or ranking/collection rule is unclear.

## Quick facts

- Framework: Next.js App Router (`next@16`) + React 19 + TypeScript strict mode.
- Backend: tRPC + Prisma + NextAuth (JWT session).
- Styling: Tailwind CSS + shadcn/ui.
- Package manager: npm (`package-lock.json` is present).

## Commands (npm)

- Install deps: `npm install`
- Dev server: `npm run dev`
- Production build: `npm run build`
- Start production server: `npm run start`
- Lint all files: `npm run lint`
- Lint a single file: `npx eslint path/to/file.ts`
- Alternate single-file lint: `npm run lint -- path/to/file.ts`
- Optional typecheck: `npx tsc --noEmit`
- Seed DB data: `npm run seed`
- Generate rankings: `npm run rankings`
- Maintenance: `npm run prune:run-paths`, `npm run prune:guest`, `npm run billing:sync-expiry`

## Tests and single-test execution

- There is currently no test runner configured in `package.json`.
- No `test` script exists, and no Jest/Vitest/Playwright config file is present.
- Because of this, there is no working "single test" command yet.
- If you add tests, add scripts and include documented single-test commands in the same change.

## Cursor / Copilot rules

- No `.cursor/rules/` directory found.
- No `.cursorrules` file found.
- No `.github/copilot-instructions.md` found.

## Project layout

- `app/` often re-exports from `src/app/*`; prefer editing canonical files in `src/app/*`.
- `src/app/`: primary App Router pages and route handlers.
- `src/server/`: tRPC context, routers, auth, and server logic.
- `src/lib/`: shared domain utilities (`env`, map style helpers, path matching, tier logic).
- `src/components/`: app-specific client components.
- `components/ui/`: shadcn/ui primitives.
- `lib/utils.ts`: shared `cn()` helper used by ui components.
- `prisma/schema.prisma`: data model and enums.
- `scripts/*.mjs`: maintenance/ops scripts.

## Environment variables

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- `NEXT_PUBLIC_TOSS_CLIENT_KEY` (optional in some flows)
- `TOSS_SECRET_KEY` (server-side billing flow)
- `BILLING_WEBHOOK_SECRET` (webhook signature validation)

## TypeScript and formatting

- TypeScript strict mode is enabled (`tsconfig.json`).
- Indentation is 2 spaces.
- In `src/**` and most app/server code: single quotes + semicolons.
- In `components/ui/**` (shadcn style): double quotes + no semicolons.
- Do not reformat unrelated files; match the style already used in the file you touch.
- Avoid `any`, `@ts-ignore`, and `@ts-expect-error`.

## Naming conventions

- Use `PascalCase` for React components, interfaces, and Prisma models.
- Use `camelCase` for variables, functions, and procedure names.
- Use `SCREAMING_SNAKE_CASE` for module-level constants.
- Keep route segment names and non-component file names in existing project style (`kebab-case` where already used).

## Imports and module boundaries

- Prefer path aliases: `@/components/*`, `@/lib/*`, `@/server/*`, `@/app/*`.
- For nearby server modules, relative imports are common and acceptable (`../trpc`).
- Import order convention: external packages, internal aliases, then relative imports.
- Use `import type { ... }` for type-only imports when practical.

## React / Next.js conventions

- Default to Server Components; add `'use client';` only for interactive/browser logic.
- Keep client pages/components focused; move non-UI logic to `src/lib` when reusable.
- Use `next/link` for internal navigation.
- In client code, avoid direct `process.env` access; prefer typed env helpers (`src/lib/env.ts`).
- UI currently uses a glassmorphism-like visual language; keep changes visually consistent.

## API and server conventions

- tRPC context and auth middleware live in `src/server/trpc.ts`.
- Build routers with `createTRPCRouter` and procedures with `publicProcedure` / `protectedProcedure`.
- Validate all procedure inputs with `zod` before DB access.
- Keep Prisma access inside server modules and routers.
- Follow existing guest fallback pattern where used (upsert/find guest user when session is absent).

## Prisma and data conventions

- Prisma client wrapper: `@/lib/prisma`.
- Use explicit DTO-like return objects from routers when client shape should be stable.
- Keep schema changes small and deliberate; schema updates can affect billing/auth/ranking flows.
- Do not leak internal-only fields to the client by default.

## Auth conventions

- NextAuth config is in `src/server/auth.ts`.
- JWT strategy is used for sessions.
- Session augmentation type is in `src/types/next-auth.d.ts`.
- If auth/session fields change, update both auth callbacks and TS declaration files.

## Error handling conventions

- Prefer explicit errors over silent failures.
- For tRPC procedure failures, prefer `TRPCError` with meaningful codes.
- Avoid empty catch blocks.
- User-facing messages may be Korean in existing routes; keep language consistent with surrounding code.

## Validation conventions

- Use `zod` schemas for all external input (tRPC input, webhook payload parsing, env parsing).
- Keep numeric ranges/limits explicit in schemas (distance, pagination limits, coordinates).
- Parse unknown JSON payloads carefully before use.

## Files to sample before coding

- Server base patterns: `src/server/trpc.ts`, `src/server/root.ts`
- Router style: `src/server/routers/course.ts`, `src/server/routers/billing.ts`
- App page style: `src/app/courses/page.tsx`, `src/app/courses/[id]/page.tsx`
- Route handler style: `src/app/api/billing/webhook/route.ts`
- UI primitive style: `components/ui/button.tsx`, `components/ui/card.tsx`

## Safe change checklist

- Confirm the nearest existing pattern in the same folder before editing.
- Keep bug fixes minimal; do not refactor unrelated code during a fix.
- Run lint/typecheck for touched areas when possible.
- Do not add new dependencies unless required for the requested task.
- Do not commit secrets (`.env`, keys, tokens) or generated artifacts.
- Do not commit unless explicitly requested by the user.
