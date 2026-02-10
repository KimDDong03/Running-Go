# Agent Notes for running-go

This file is guidance for automated coding agents working in this repo.
Keep changes small, follow local conventions, and avoid guessing when the
context is unclear.

## Session startup

- Always read `SESSION_NOTES.md` at the start of a new session to resume context.

## Quick facts

- Framework: Next.js (App Router) + React 19 + TypeScript (strict).
- Backend: tRPC + Prisma + NextAuth.
- Styling: Tailwind CSS, shadcn/ui components.
- Package manager: npm (package-lock.json present).

## Commands (npm)

- Install deps: `npm install`
- Dev server: `npm run dev`
- Production build: `npm run build`
- Start prod server: `npm run start`
- Lint (eslint): `npm run lint`
- Seed data: `npm run seed`
- Generate rankings: `npm run rankings`

### Single-file linting

- Prefer: `npx eslint path/to/file.ts`
- ESLint config: `eslint.config.mjs` (Next core-web-vitals + TS)

### Tests

- No test runner configured in `package.json`.
- If you add tests, include a script and document how to run a single test.

### Type checks

- TypeScript is strict; Next.js handles typechecking on build.
- Optional manual check: `npx tsc --noEmit`.

## Cursor/Copilot rules

- No `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md` found.

## Project layout

- App Router pages live in both `app/` and `src/app/`.
  - Follow the closest existing pattern in the folder you are editing.
- UI components in `components/ui/` (shadcn style, no semicolons).
- Shared utilities in `lib/` and `src/lib/`.
- Backend logic in `src/server/` (tRPC routers, auth, context).
- Prisma schema in `prisma/schema.prisma`.

## Environment variables

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`

## TypeScript and formatting

- TS strict mode enabled (`tsconfig.json`).
- Indentation: 2 spaces.
- Use semicolons and single quotes in `src/` code.
- shadcn/ui files use double quotes and no semicolons.
- Match existing file style instead of reformatting globally.

## Imports and module boundaries

- Prefer path aliases where available:
  - `@/components/*`, `@/lib/*`, `@/server/*`, `@/app/*`.
- Use relative imports for nearby server modules when already in use
  (e.g. `src/server/routers/*` uses `../trpc`).
- Group imports: external libraries first, internal aliases next, relative last.

## React / Next.js conventions

- Default to Server Components; add `'use client';` only when needed.
- Keep client components minimal and focused on interactivity.
- Use `next/link` for navigation.
- Avoid direct access to `process.env` in client components; use typed envs.

## API and server conventions

- tRPC setup in `src/server/trpc.ts`.
- Export routers via `createTRPCRouter` and `publicProcedure`.
- Use `protectedProcedure` for auth-required routes.
- Prefer `TRPCError` for auth/validation errors in tRPC handlers.
- Validate inputs with `zod` schemas before DB access.

## Prisma conventions

- Prisma client wrapper: `@/lib/prisma`.
- Keep DB access inside tRPC routers and server-only modules.
- Avoid leaking raw Prisma types to client; return DTOs where needed.

## Auth conventions

- NextAuth config in `src/server/auth.ts`.
- Session uses JWT strategy.
- When adding auth fields, update `src/types/next-auth.d.ts`.

## UI / styling conventions

- Tailwind CSS for layout and spacing.
- Use shadcn/ui components from `components/ui/` where possible.
- Use `cn()` from `@/lib/utils` to merge class names.
- Keep visual changes local; avoid restyling unrelated components.

## Error handling

- Prefer explicit errors with messages over silent failures.
- Avoid empty catch blocks.
- For API routes, return structured errors (tRPC or thrown Error).

## Data validation

- Use `zod` schemas in routers for input validation.
- Ensure numeric constraints and optional fields match schema requirements.

## Files to sample for style

- Server: `src/server/trpc.ts`, `src/server/routers/course.ts`.
- Client: `src/app/page.tsx`, `src/components/map/Map.tsx`.
- UI: `components/ui/button.tsx`.

## Safe change checklist

- Check for existing patterns in the same folder.
- Avoid large refactors during bug fixes.
- Keep TypeScript types explicit; do not use `as any` or ts-ignore.
- Update docs/tests if you introduce new scripts or flows.
