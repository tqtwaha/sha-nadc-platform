# SHA NADC Platform · v2

Production rebuild of the SHA National Ambulance Dispatch Centre. Runs in
parallel to the v1 vanilla demo at [tqtwaha/sha-nadc](https://github.com/tqtwaha/sha-nadc).

## Status

Phase 0 — monorepo scaffolding. Tracker:
**[v2/TRACKER.md (in v1 repo)](https://github.com/tqtwaha/sha-nadc/blob/main/v2/TRACKER.md)**

## Quick start

```bash
pnpm install
pnpm dev          # all apps in parallel via Turborepo
pnpm typecheck
pnpm lint
pnpm test
```

The web app starts at <http://localhost:3000>.

## Layout

```
apps/
  web/             Next.js 15 — every web screen (PSAP, dispatch, supervisor,
                   hospital, claims, providers, admin, wall)
  mobile/          Expo + React Native — EMT field app  (TBD)
packages/
  ui/              Shared component library + design tokens
  types/           Zod schemas (single source of truth for domain)
  domain/          Pure business logic (sim engine ported from v1)  (TBD)
  supabase/        Supabase client wrappers + generated DB types     (TBD)
  config/          Shared TypeScript / ESLint / Tailwind configs
sql/               Supabase migrations
tests/
  unit/            Vitest
  e2e/             Playwright
docs/
  architecture.md  System architecture                                (TBD)
  runbooks/        Operational runbooks                                (TBD)
```

## Decisions

See [STACK.md (in v1 repo)](https://github.com/tqtwaha/sha-nadc/blob/main/v2/STACK.md)
for the architecture decision record with rationale per choice.

## Why a new repo

The v1 vanilla product stays demoable at its existing URL while v2 is
built. v1 and v2 share no code; this avoids the risk of breaking the
working demo during a multi-month rebuild.

When v2 reaches production readiness, the v1 repo is archived.
