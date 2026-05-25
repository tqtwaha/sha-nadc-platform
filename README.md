# SHA NADC Platform · v2

Production rebuild of the **Social Health Authority of Kenya — National Ambulance
Dispatch Centre**. End-to-end operational platform covering call intake, dispatch,
EMT crew, hospital receiving, SHIF claim billing, and an LED-wall dashboard.

Live: <https://sha-nadc-platform-web.vercel.app>

---

## The nine surfaces

| Route | Purpose |
|---|---|
| `/` | Operational launchpad — live KPIs, P1 inflight panel, jump-to grid |
| `/wall` | LED video-wall dashboard — map centerpiece, auto-refresh, P1 alarm |
| `/psap` | Call-taker intake form — MPDS determinant → priority → incident |
| `/dispatch` | Dispatcher CAD — queue, Mapbox map, assign / advance / clear |
| `/dispatch/[id]` | Single-incident view with hospital routing + audit log |
| `/supervisor` | Floor analytics — fleet utilization, county heatmap, SLA |
| `/emt` | EMT unit picker — units-with-active up top |
| `/emt/[unit]` | Crew screen — incident card + lifecycle buttons + Clear+Bill |
| `/hospital` | Receiving directory — diversion, capacity, incoming counts |
| `/hospital/[id]` | Single hospital — incoming list, recent arrivals, claims |
| `/providers` | 10 SHA-contracted ambulance operators with live rollups |
| `/claims` | SHIF claims queue — filter, search, CSV export, bulk actions |
| `/claims/[id]` | Claim detail — tariff breakdown, vitals, M-Pesa/AfyaLink/KRA |
| `/claims/[id]/print` | A4-friendly PDF view (Cmd+P → save as PDF) |
| `/admin` | Admin index → users + hospitals |
| `/admin/users` | Operations roster (Clerk-bridged when auth on) |
| `/admin/hospitals` | National hospital directory |

Press **⌘K / Ctrl+K** anywhere → command palette (search incidents, claims,
units, hospitals; jump to any app).

## End-to-end flow

```
PSAP form → pending incident
  → Dispatch console assigns nearest unit (in-zone, ALS-preferred)
  → EMT crew acknowledges → en-route → on-scene → transport
  → EMT taps "Clear + Bill" with distance + vitals
  → SHIF claim auto-drafted via computeTariff
  → Claims queue submits → approves → M-Pesa pay (stub) → KRA invoice (stub)
```

All of it backed by Supabase + Realtime fan-out: open `/wall` on one tab,
`/dispatch` on another, click anything → both update inside ~250ms.

## Stack

- **Web**: Next.js 15 (App Router, RSC) · React 19 · Tailwind v4
- **Mobile**: Expo SDK 51 · React Native 0.74 · expo-router
- **Backend**: Supabase (Postgres + Realtime + Storage + Auth)
- **Auth**: Clerk (optional — app stays open in demo mode if keys absent)
- **Maps**: Mapbox GL v3
- **Domain**: TypeScript + Zod (`packages/types`, `packages/domain`)
- **Monorepo**: pnpm workspaces + Turborepo
- **Tests**: Vitest + Playwright

## Quick start

```bash
pnpm install
cp apps/web/.env.local.example apps/web/.env.local   # fill in keys
pnpm --filter @sha-nadc/web dev                       # http://localhost:3000
```

Required env vars in `apps/web/.env.local`:

| Var | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Inlined at build time |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Inlined at build time |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only — bypasses RLS |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Public Mapbox token (enables /dispatch + /wall maps) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Optional — enables auth gates |
| `CLERK_SECRET_KEY` | Optional — pair with publishable |
| `CRON_SECRET` | Required for `/api/sim/reset`; secures Vercel cron |

For local SQL apply:

```bash
psql "$SUPABASE_DB_URL" -f sql/0001_extensions.sql
# ...etc for 0002 through 0007
pnpm -w tsx scripts/seed-db.ts   # 270 units, 62 hospitals, 10 agents, 12 incidents, 30 claims
```

## Sim endpoints

The dashboard is "alive" thanks to three internal cron-friendly endpoints:

| Endpoint | Effect | Auth |
|---|---|---|
| `GET/POST /api/sim/spawn?n=N` | Insert N (1–10) random pending incidents | CRON_SECRET (optional) |
| `GET/POST /api/sim/tick?n=N` | Advance N active incidents one lifecycle step; transport→cleared mints a claim | CRON_SECRET (optional) |
| `POST /api/sim/reset?keep=H` | Wipe incidents/claims/events older than H hours; reset fleet to available | CRON_SECRET **required** |

`vercel.json` runs `/api/sim/spawn?n=3` daily at 05:00 UTC (08:00 EAT) so
the wall has something to show each morning. Bump to higher frequency on
Vercel Pro tier.

## Deployment

```bash
git push origin main   # → Vercel auto-deploys @sha-nadc/web in ~30s
```

Apply SQL migrations via `psql` against the production Supabase URL. The
mobile app ships via EAS:

```bash
pnpm --filter @sha-nadc/mobile dev               # Expo Go QR
pnpm --filter @sha-nadc/mobile build:android     # EAS preview
```

## Repository layout

```
apps/
  web/        Next.js — every web surface
  mobile/     Expo + React Native — EMT crew companion
packages/
  ui/         Shared components + Tailwind v4 design tokens
  domain/     Pure business logic (computeTariff, zones, COMPLAINTS, sim)
  types/      Zod schemas — single source of truth
  supabase/   Typed Supabase client wrappers (browser/server/service)
  config/     Shared TS / ESLint / Tailwind base configs
sql/          Supabase migrations (0001–0007)
scripts/      check-env.ts, seed-db.ts
```

## What's stubbed

External integrations are stubbed at the application layer (`apps/web/src/app/claims/actions.ts`):

- **M-Pesa Daraja** — `initiatePayment` fakes a callback with a `QXL...` reference
- **SHA AfyaLink** — `submitToSha` stamps `submitted_at`
- **KRA eTIMS** — `generateInvoice` mints a `KRA-INV-YYYYMM-####` reference

Swap each for the real adapter when SHA/Safaricom/KRA endpoints are
provisioned. The DB columns (`mpesa_ref`, `invoice_number`, `submitted_at`,
`approved_at`, `paid_at`) are already in place.

## Status

**Production-ready for the SHA pitch.** Every operational surface is
clickable against the live Supabase backend with Realtime fanout, the
v1 UI prototypes serve as the public layer, and the v2 React layer
handles every detail page + Server Action + Admin write-side.

### Demo flow (90 seconds)

1. Open `/wall` on a screen (LED dashboard).
2. Open `/admin/sim` on a phone/laptop.
3. Tap **"▶ Run demo"** — `/api/sim/demo` executes the full PSAP →
   dispatch → en route → on scene → transport → cleared → SHA submit →
   M-Pesa pay → KRA invoice flow in 10 seconds with live narration.
4. Watch the wall light up with the P1 pin in Westlands moving through
   its lifecycle. Click "Open claim" to see the SHIF tariff breakdown,
   vitals, audit log on the v2 detail page.

### What's done (this session)

- v1 HTML UI restored for all 10 operational slugs (`/wall`, `/dispatch`,
  `/supervisor`, `/emt`, `/psap`, `/hospital`, `/claims`, `/providers`,
  `/admin`, `/dashboard`) via `apps/web/public/legacy/`
- v2 React layer owns detail pages, Server Actions, Admin write-side
- Provider deep view (`/providers/[id]`) with fleet roster + invoicing
- Admin write-side: feature flags, pending approvals, sim controls,
  audit log, status board
- `/api/cron/heartbeat` keeps the demo populated daily
- `/api/sim/demo` scripted scenario for stakeholder pitches
- Mobile Expo app with vitals + realtime + push scaffold + Maps deep
  links + dialer
- PWA install manifest for `/emt` (no Expo Go needed for field crews)
- Clerk auth with graceful no-key demo fallback
- Sentry (gated on DSN), Vercel Analytics + Speed Insights
- GitHub Actions CI (typecheck + tests + build) on every push/PR
- Playwright E2E smoke suite (synthetic monitor against live deploy)
- Vitest domain coverage (31 tests across tariff/zones/priority/incidents)
- `docs/architecture.md` + 4 runbooks (deploy, rollback,
  incident-response, scaling)

### What's left for true production

- Set CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY in Vercel env → middleware
  flips to gated mode automatically
- Per-role RLS bound to Clerk JWT (sql/0009 — write once Clerk is on)
- Real M-Pesa Daraja / SHA AfyaLink / KRA eTIMS adapters (stubs in
  place, swap one file each per vendor signing)
- EAS Build pipeline for the mobile app → TestFlight + Play Internal
- Mobile signature capture for ePCR (needs react-native-signature-canvas)
- Mobile background GPS reporting (needs expo-task-manager)
- Mobile camera attachments for ePCR photos

## License

Internal — Republic of Kenya / Social Health Authority.
