# SHA NADC v2 — Architecture

_Last updated: 2026-05-25 · Read this before touching the platform._

## One-paragraph summary

SHA NADC v2 is a Next.js 15 application (App Router + Server Components +
Server Actions) backed by Supabase (Postgres + Realtime + Storage), gated
by Clerk auth, deployed on Vercel. The 10 operational UI screens are
served as **v1 HTML prototypes** out of `apps/web/public/legacy/`, wired
to the v2 Supabase backend through a `/api/config` shim. Detail pages
(`/claims/[id]`, `/dispatch/[id]`, `/emt/[unit]`, `/admin/*`) and all
APIs are v2 React + TypeScript. The native EMT companion is an Expo
React Native app sharing the same Supabase backend over the anon key.

## System map

```
                          ┌──────────────────┐
                          │   Vercel Edge    │
                          │  (Next.js 15)    │
                          └────────┬─────────┘
                                   │
       ┌───────────────────────────┼───────────────────────────────┐
       │                           │                               │
   beforeFiles                Middleware                       App Router
   rewrites                   (Clerk gate +                    + Server Actions
   /wall ──→ /legacy/         allowlist)                       + Route Handlers
   /dispatch ──→ /legacy/                                      + RSC
   …                                                            │
                                                                │
       ↓                                                        ↓
  apps/web/public/                                       apps/web/src/app/
  ├── legacy/                                            ├── api/
  │   ├── dashboard/                                     │   ├── config       ← v1 boot shim
  │   ├── dispatch/                                      │   ├── cron/heartbeat
  │   ├── supervisor/                                    │   ├── health
  │   ├── emt/                                           │   ├── palette       ← Cmd+K
  │   ├── psap/                                          │   └── sim/*         ← spawn / tick / reset
  │   ├── hospital/                                      ├── admin/            ← users/hospitals/audit/sim/flags/pending
  │   ├── claims/                                        ├── claims/[id]/      ← detail + print + actions
  │   ├── providers/                                     ├── dispatch/[id]/    ← detail + actions
  │   └── admin/                                         ├── emt/[unit]/       ← crew screen
  ├── lib/    (NACDState engine)                         ├── hospital/[id]/
  ├── assets/ (tokens-v2.css, favicons)                  ├── providers/[id]/
  └── manifest.json (PWA)                                ├── sign-in/  sign-up/
                                                         ├── status/
                                                         └── wall/  /  /supervisor … (v2 fallbacks, shadowed by rewrites)

       ↓                                                        ↓
  v1 NACDState (~3000 lines ES5)                         packages/
   - fetches /api/config                                 ├── domain/     ← TARIFFS, COMPLAINTS, zones, sim builders
   - inits Supabase realtime                             ├── types/      ← Zod schemas
   - simulates lifecycle + map drawing                   ├── supabase/   ← typed clients (browser / server / service)
                                                         ├── ui/         ← Tailwind v4 tokens + Topbar + AppSwitcher
                                                         └── config/     ← shared tsconfig

                                  ↓
                          Supabase (Postgres)
                          ├── hospitals (62)
                          ├── fleet_units (270)
                          ├── agents (10 seeded)
                          ├── incidents
                          ├── dispatch_events    ← audit log
                          ├── claims
                          ├── feature_flags      ← stub↔real cutovers
                          └── pending_approvals  ← supervisor queue

                          Realtime publication
                          covers all 8 tables.
```

## Two UIs, one backend

The **v1 UI** is the production surface for stakeholders — pixel-perfect
match to the MVP they signed off. Served as static HTML so nothing in
the v1 code needs to change as the backend evolves. Calls
`/api/config` on boot for keys, then talks directly to Supabase Realtime
via the anon key. Lives in `apps/web/public/legacy/`.

The **v2 React/TS layer** owns:

- All detail pages that need rich interactivity (claims workflow,
  dispatch detail with Mapbox + Server Actions, EMT crew Clear+Bill).
- All APIs and Server Actions (sim endpoints, palette search, claim
  status transitions, M-Pesa / AfyaLink / KRA stubs, heartbeat cron).
- Auth gates (Clerk middleware).
- Admin write-side (feature flags, pending approvals).
- Mobile native app (Expo).

Subroutes (`/dispatch/[id]`, `/claims/[id]`, `/admin/audit`) win over
the v1 HTML because rewrites only match exact paths. Inside the v1
HTML, link targets like `/dispatch/{id}` therefore deep-link straight
into the v2 React detail view — best of both.

## Request flow — sim incident lifecycle (end-to-end)

```
1. Vercel cron 05:00 UTC
   → POST /api/cron/heartbeat (x-vercel-cron header)
   → checks feature_flag sim_auto_tick
   → spawns 1-5 incidents if active < 14
   → advances 8 random active incidents

2. New incident inserted into Supabase
   → Realtime publication broadcasts INSERT
   → /wall, /dispatch, /supervisor (v1 HTML) NACDState subscribers refresh
   → /dispatch/[id] (v2 React) RealtimeRefresh debounces, calls router.refresh()
   → /emt mobile app subscriber re-fetches if filter matches its unit
   → P1Alert client component plays audio + browser notification on P1

3. Dispatcher (or heartbeat) assigns nearest unit
   → Server Action dispatch/actions.ts:assignNearestUnit
   → tries in-zone available unit, ALS-preferred for ALS-required incidents
   → updates incidents.unit_id + .status='dispatched' + .dispatched_at
   → flips fleet_units.status='dispatched'
   → writes dispatch_event with agent_id (Clerk-bridged)
   → revalidatePath fires; Realtime broadcasts UPDATE

4. EMT crew walks the lifecycle on /emt/[unit] (web or mobile):
   acknowledge → en route → on scene → transport
   Each transition updates the incident + unit status, timestamps the
   appropriate column, writes an audit row.

5. EMT taps "Clear + Bill" with distance + vitals
   → emt/actions.ts:clearAndBill
   → computeTariff(unitType, distanceKm) from @sha-nadc/domain
   → inserts claims row (draft status, full pricing snapshot, vitals JSONB)
   → sets incident.status='cleared' + cleared_at + frees the unit
   → writes 'epcr_submitted' event
   → redirects user to /claims/[id]

6. Finance opens /claims, optionally bulk-approves the queue
   → bulk-actions.ts:bulkApproveSubmitted / bulkPayApproved
   → flips status, stamps approved_at / paid_at / mpesa_ref
   → each individual stub (M-Pesa, AfyaLink, KRA) writes a separate event

7. /admin/audit shows every step with actor + linked entity in one view.
```

## Auth & RLS

**Clerk** owns identity. When `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set:

- middleware gates every route except sign-in, sim endpoints (which
  have their own auth), `/api/config`, `/api/health`, `/status`, the
  legacy HTML + assets, and the PWA manifest.
- `<ClerkProvider>` mounts; `<AuthSlot>` shows the UserButton in the
  top-right corner of every screen.
- First sign-in auto-provisions an agents row via `lib/auth.ts:currentAgent`.
  If a seed agent already has the same email, it claims that row.

When the key is unset, the app runs as an open demo (middleware no-ops).

**Supabase RLS** is currently **permissive for development** (sql/0005).
Production rollout flips to per-role policies bound to Clerk JWT claims
in a follow-up migration once Clerk is wired.

## Data lifecycle

| Table | Owner | Realtime | Notes |
|---|---|---|---|
| `hospitals` | seed (sql/0003) | yes | 62 rows, no writes outside admin |
| `fleet_units` | seed + tick | yes | 270 rows, status churns constantly |
| `agents` | Clerk auto-provision | no | 10 seeded; `clerk_user_id` set on first sign-in |
| `incidents` | PSAP form + heartbeat + manual sim | yes | hot table |
| `dispatch_events` | every Server Action | yes | append-only audit log |
| `claims` | EMT clear + manual | yes | bills against incident |
| `feature_flags` | /admin/flags | yes | 30s cache in `lib/flags.ts` |
| `pending_approvals` | manual create + supervisor decide | yes | escalation queue |

## Sim infrastructure

Three endpoints + one cron drive the demo's liveness:

| Endpoint | Trigger | Effect |
|---|---|---|
| `POST /api/sim/spawn?n=N` | manual (curl or /admin/sim) | inserts N (1-10) pending incidents |
| `POST /api/sim/tick?n=N` | manual | advances N active incidents one step |
| `POST /api/sim/reset` | manual (CRON_SECRET required) | wipes incidents/claims/events, resets fleet |
| `GET /api/cron/heartbeat` | Vercel cron daily 05:00 UTC | spawns + advances + mints claims, respects sim_auto_tick flag |

All sim endpoints require either `Authorization: Bearer $CRON_SECRET` or
the `x-vercel-cron: 1` header (Vercel-internal cron calls).

## Mapbox

`NEXT_PUBLIC_MAPBOX_TOKEN` is the only Mapbox config. v1 prototypes pick
it up from `/api/config`; v2 React reads it inline at build time.
Map style is `mapbox://styles/mapbox/navigation-night-v1` everywhere.

## Mobile app (Expo)

`apps/mobile/` — Expo SDK 51 + React Native 0.74 + expo-router.
Two screens (`/`, `/unit/[id]`) covering unit pick + crew flow including
Clear+Bill with vitals capture. Realtime subscription on incidents
filtered to the crew's unit. Writes to Supabase via the anon key
directly — same RLS posture as the web demo.

PWA manifest at `/manifest.json` lets users install the v1 `/emt`
prototype as a home-screen app on any mobile browser without Expo Go.

## Observability

- `@vercel/analytics` + `@vercel/speed-insights` mounted in root layout.
- `@sentry/nextjs` configured in `sentry.{client,server,edge}.config.ts`.
  Sentry no-ops cleanly when DSN unset.
- `/api/health` JSON probe for external uptime monitors.
- `/status` public dashboard surfaces env config + recent throughput.
- `/admin/audit` is the in-app audit log of every dispatch_event.

## Testing

- **Vitest** at `packages/domain` — 31 tests across tariff / zones /
  priority / incidents.
- **Playwright** at `tests/e2e/smoke.spec.ts` — 9 tests proving the
  routes return + endpoints reject unauthenticated writes. Defaults to
  hitting the live deploy as a synthetic monitor.
- **GitHub Actions** (`.github/workflows/ci.yml`) runs typecheck + tests
  + build on every push and PR.

## When you join the project

1. Read this file, then `SHA_NADC_MVP_Spec_v4_MERGE.md` (in the v1 repo).
2. `pnpm install` from repo root.
3. Copy `apps/web/.env.local.example` → `.env.local`, fill in your
   Supabase keys.
4. Apply SQL migrations: `for f in sql/0001*.sql sql/0002*.sql … ; do
   psql "$SUPABASE_DB_URL" -f $f ; done` (idempotent).
5. `pnpm seed` to populate the DB.
6. `pnpm --filter @sha-nadc/web dev` → <http://localhost:3000>.
7. `pnpm test` for unit + `pnpm test:e2e:local` for E2E.

See `docs/runbooks/` for deploy, rollback, incident response, scaling.
