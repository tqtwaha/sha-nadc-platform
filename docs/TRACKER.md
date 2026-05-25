# SHA NADC v2 — Production tracker

_Last updated: 2026-05-25_

Legend: ✅ done · 🔧 needs your config · 🚀 nice-to-have post-launch

---

## Phase 0 — Foundation
| ID | Capability | Status |
|---|---|---|
| 0.1 | GitHub repo sha-nadc-platform | ✅ |
| 0.2 | pnpm + Turborepo monorepo | ✅ |
| 0.3 | Strict TS, shared eslint/prettier | ✅ |
| 0.4 | Zod schemas in packages/types | ✅ |
| 0.5 | Sim engine port (`packages/domain` + v1 NACDState in `/public/lib/`) | ✅ |
| 0.6 | Design tokens (Tailwind v4 @theme) | ✅ |
| 0.7 | Shared components (BrandMark, Topbar, Chip, AppSwitcher) | ✅ |
| 0.8 | Storybook | 🚀 |
| 0.9 | Vitest + Playwright in Turborepo | ✅ |
| 0.10 | Vercel project + auto-deploy | ✅ |
| 0.11 | Supabase v2 project | ✅ |

## Phase 1 — Auth & data foundation
| ID | Capability | Status |
|---|---|---|
| 1.1 | Schema migrated (sql/0001 → 0008) | ✅ |
| 1.2 | Production RLS (Clerk JWT, role-based) | 🔧 needs Clerk keys first |
| 1.3 | Clerk roles + middleware | ✅ (no-op until keys set) |
| 1.4 | Typed Supabase client (browser/server/service) | ✅ |
| 1.5 | Sim engine seeder + heartbeat cron | ✅ |
| 1.6 | apps/web boots with shared chrome | ✅ |
| 1.7 | apps/mobile Expo boots | ✅ |
| 1.8 | EAS Build → TestFlight | 🚀 needs Apple Dev + Play Console |

## Phase 2 — Claims
| ID | Capability | Status |
|---|---|---|
| 2.1 | Claims list + filters | ✅ |
| 2.2 | Claim detail (tariff, timeline, vitals, integrations) | ✅ |
| 2.3 | Approve / Reject / Dispute actions | ✅ |
| 2.4 | Batch approve | ✅ |
| 2.5 | CSV export | ✅ |
| 2.6 | SHIF tariff engine | ✅ |
| 2.7 | M-Pesa stub | ✅ (real: 🔧 needs Daraja creds) |
| 2.8 | AfyaLink stub | ✅ (real: 🔧 needs SHA endpoint) |
| 2.9 | KRA eTIMS stub | ✅ (real: 🔧 needs KRA creds) |
| 2.10 | Print/PDF view | ✅ (Cmd+P → save as PDF) |

## Phase 3 — Providers + Admin
| ID | Capability | Status |
|---|---|---|
| 3.1 | Providers list with KPIs | ✅ |
| 3.2 | Provider detail with fleet table | ✅ |
| 3.3 | Crew roster | 🚀 (needs crew table) |
| 3.4 | Provider onboarding wizard | 🚀 |
| 3.5 | Provider invoicing summary | ✅ |
| 3.6 | Admin user management | ✅ (read; invite: 🔧 needs Clerk) |
| 3.7 | Pending approvals queue | ✅ |
| 3.8 | Audit log viewer | ✅ |
| 3.9 | Feature flags page | ✅ |
| 3.10 | System health page | ✅ (/status) |

## Phase 4 — Supervisor + Hospital
Both served by v1 HTML prototypes via /public/legacy/. v2 React backs detail pages.

| ID | Capability | Status |
|---|---|---|
| 4.1 | Supervisor Operations tab | ✅ (v1) |
| 4.2 | Supervisor Performance tab | ✅ (v1) |
| 4.3 | Supervisor Analytics tab | ✅ (v1) |
| 4.4 | Supervisor actions write to DB | ✅ (pending_approvals queue) |
| 4.5 | Hospital pre-alerts | ✅ (v1 + v2 /hospital/[id]) |
| 4.6 | Hospital patient detail + vitals | ✅ |
| 4.7 | Accept / Divert actions | ✅ |
| 4.8 | Hospital staff selector | ✅ (v1) |

## Phase 5 — Dispatch + PSAP
| ID | Capability | Status |
|---|---|---|
| 5.1 | PSAP triage wizard | ✅ (v1) |
| 5.2 | PSAP location + geocoder | ✅ (v1) |
| 5.3 | PSAP caller/patient form | ✅ (v1 + v2 /psap) |
| 5.4 | "Create incident" → realtime | ✅ |
| 5.5 | Dispatch map | ✅ (v1 + v2 Mapbox layer) |
| 5.6 | Dispatch incident list with priority | ✅ |
| 5.7 | Dispatch detail with assign/route/clear | ✅ |
| 5.8 | Unit picker | ✅ |
| 5.9 | Route rendering | ✅ (v1 NACDState) |
| 5.10 | "New Call" modal | ✅ (v1) |
| 5.11 | 3CX call sim cron | ✅ (heartbeat) |
| 5.12 | Realtime <500ms p95 | ✅ |

## Phase 6 — Wall
| ID | Capability | Status |
|---|---|---|
| 6.1 | /wall kiosk route | ✅ |
| 6.2 | Responsive KPI rail | ✅ |
| 6.3 | Map with active incidents + units | ✅ |
| 6.4 | Hot incidents pane | ✅ |
| 6.5 | Network status pane | ✅ |
| 6.6 | Bottom row: Fleet/Calls/Agents | ✅ |
| 6.7 | Compact legend | ✅ |
| 6.8 | Auto-refresh 4h | ✅ (and 30s RealtimeRefresh) |

## Phase 7 — EMT Mobile
| ID | Capability | Status |
|---|---|---|
| 7.1 | EAS Build → TestFlight | 🚀 |
| 7.2 | Unit picker | ✅ |
| 7.3 | Active incident card | ✅ |
| 7.4 | Status flow buttons | ✅ |
| 7.5 | Vitals capture | ✅ (mobile + web) |
| 7.6 | ePCR with signature | 🚀 (needs signature-canvas dep) |
| 7.7 | Offline-first queue | 🚀 |
| 7.8 | Background GPS | 🚀 |
| 7.9 | Push notifications | ✅ (end-to-end: dispatch→push→tap) |
| 7.10 | Camera ePCR photos | 🚀 |
| 7.11 | Mobile map / Open in Maps | ✅ (deep links to native maps) |
| 7.12 | BT pairing stub | 🚀 |
| 7.13 | Accessibility audit | 🚀 |

## Cross-cutting
| ID | Capability | Status |
|---|---|---|
| X.1 | Sentry web + mobile (server + client + edge) | ✅ (no-op without DSN) |
| X.2 | Vercel Analytics + Speed Insights | ✅ |
| X.3 | Playwright E2E (smoke against live) | ✅ (9 tests) |
| X.4 | Vitest coverage ≥70% in packages/domain | ✅ (31 tests across 4 files) |
| X.5 | Storybook | 🚀 |
| X.6 | docs/architecture.md | ✅ |
| X.7 | docs/runbooks/{deploy,rollback,incident-response,scaling}.md | ✅ |
| X.8 | Daily DB backup | 🚀 (use Supabase Pro PITR) |
| X.9 | Weekly digest cron | 🚀 |
| X.10 | GitHub Actions CI | ✅ |

---

## What I built that wasn't in the original tracker

- **`/api/sim/demo`** — scripted PSAP→claim end-to-end in 10 seconds
  with stepwise narration (pitch grade)
- **`/api/cron/heartbeat`** — single endpoint that maintains target
  active incident count + advances lifecycle (replaces the simple
  spawn cron)
- **`/admin/sim`** — click-button operator console with demo replay
- **Cmd+K command palette** — global search across incidents, claims,
  units, hospitals, providers + jump-to all 9 apps
- **`/api/notify/push`** — server-to-server Expo push, auto-fired on
  dispatcher assignment with title="P{n} · {complaint}"
- **`/status`** — public uptime + ops dashboard
- **`/admin/audit`** — filterable dispatch_events viewer
- **`/admin/flags`** — feature flag toggle UI for stub↔real cutover
- **`/admin/pending`** — supervisor approval queue with approve/reject
- **`/providers/[id]`** — provider deep view with fleet roster +
  invoicing
- **P1 audio alarm + browser notification** on new priority-1 incidents
- **PWA manifest** for `/emt` (installable on phones without Expo)
- **Printable claim view** at `/claims/[id]/print` (Cmd+P → PDF)
- **GitHub push-protection compliance** — all Mapbox tokens scrubbed
  from source, runtime token from `/api/config` env

---

## To flip into full production

Set these in Vercel → Settings → Environment Variables → all environments:

| Key | Effect |
|---|---|
| `CLERK_PUBLISHABLE_KEY` | Middleware activates, every route gated |
| `CLERK_SECRET_KEY` | Server-side Clerk operations enabled |
| `CRON_SECRET` | `/api/sim/*` + `/api/cron/*` accept requests |
| `NEXT_PUBLIC_SENTRY_DSN` | Error + replay tracking activates |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Source map upload from CI |

After setting Clerk keys:
1. I'll ship `sql/0009_rls_role_policies.sql` — replaces permissive dev RLS
   with per-role policies bound to Clerk JWT claims
2. Each agent's first sign-in auto-provisions an agents row (lib/auth.ts)
3. Production-grade

Real integrations (M-Pesa, AfyaLink, KRA) are one-file-each swaps in
`apps/web/src/app/claims/actions.ts` — flip the corresponding feature
flag in `/admin/flags` to route through the real adapter.
