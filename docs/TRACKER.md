# SHA NADC v2 — Production tracker

_Last updated: 2026-05-28_

Legend: ✅ done · 🟡 partial · 🔧 needs YOUR config · 🚀 nice-to-have post-launch

Live: <https://sha-nadc-platform-web.vercel.app>

---

## 🔧 PENDING ON YOUR END (env vars in Vercel → Settings → Environment Variables)

These are the only things blocking "full production". All are 5-minute UI changes — no code from me needed.

| Key | Unlocks | Priority |
|---|---|---|
| `CRON_SECRET` | `/api/sim/*` + `/api/cron/heartbeat` + `/admin/sim` buttons + `/api/sim/demo`. **Set this first** — without it the daily auto-populate cron and the demo button are locked. Any random string works. | 🔴 HIGH |
| `CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` | Sign-in gates on every operational route. Until set, the app is an open demo (fine for pitching, not for production). Create a free Clerk app at clerk.com. | 🔴 HIGH |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | ✅ Already set by you — maps render on /dispatch + /wall. | ✅ DONE |
| `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`) | Error tracking + session replay. App runs fine without it. | 🟡 MED |

After you set `CLERK_*`, ping me — I'll ship `sql/0012_rls_role_policies.sql` (per-role row-level security bound to Clerk JWT) within one pass.

### Accounts you'll eventually need (not blocking the pitch)

| Account | For | When |
|---|---|---|
| Apple Developer ($99/yr) | EMT app on TestFlight/App Store | Month 3 (mobile rollout) |
| Google Play Console ($25 once) | EMT app on Play Internal | Month 3 |
| Vercel Pro ($20/mo) | Minute-by-minute sim cron (Hobby = daily only) | When you want a continuously-live demo |
| M-Pesa Daraja, SHA AfyaLink, KRA eTIMS creds | Real payment/claims integrations (stubs work now) | When vendor contracts sign |

---

## ✅ DONE — core platform

### Cross-screen data consistency (the big one — fixed 2026-05-28)
| Item | Status |
|---|---|
| NACDState writes match v2 schema (complaint/icd11/lat/lng, not v1 names) | ✅ |
| NACDState loads shared incident+fleet pool from DB on init | ✅ |
| New incident on any screen appears on all others (realtime hydrate) | ✅ |
| PSAP create → dispatch sees pending → assign unit → EMT sees it | ✅ |
| Same patient name / diagnosis / caller carried across all screens | ✅ |
| EMT clear → claim minted → appears in /claims live | ✅ |
| No more 12-incidents-per-tab write storm (seed=0 when DB-wired) | ✅ |
| display_id collision prevention (incCounter bootstrapped from DB) | ✅ |
| source check constraint broadened (heartbeat/demo now persist) | ✅ |

### Phase 0 — Foundation · all ✅
Monorepo, TS strict, Zod schemas, design tokens (Tailwind v4 @theme), shared
components, Vitest+Playwright, Vercel, Supabase v2.

### Phase 1 — Auth & data
| Item | Status |
|---|---|
| Schema migrated (sql/0001 → 0011) | ✅ |
| Typed Supabase clients (browser/server/service) | ✅ |
| Sim seeder + heartbeat cron | ✅ |
| Clerk middleware (no-op until keys set) | ✅ |
| Production RLS (role-based, Clerk JWT) | 🔧 needs Clerk keys |

### Phase 2 — Claims · all ✅
List + filters, detail w/ tariff+timeline+vitals, approve/reject/dispute,
bulk approve, CSV export, SHIF tariff engine, M-Pesa/AfyaLink/KRA stubs,
printable PDF view.

### Phase 3 — Providers + Admin
| Item | Status |
|---|---|
| Providers list with KPIs | ✅ |
| Provider detail (fleet roster + invoicing) | ✅ |
| Crew roster | 🚀 needs crew table |
| Provider onboarding wizard | 🚀 |
| Admin user management (read) | ✅ |
| Admin user invite/role | 🔧 needs Clerk |
| Pending approvals queue | ✅ |
| Audit log viewer | ✅ |
| Feature flags page | ✅ |
| System health (/status) | ✅ |
| Sim control panel (/admin/sim) | ✅ |

### Phase 4 — Supervisor + Hospital
| Item | Status |
|---|---|
| Supervisor screens (v1 layout) | ✅ render |
| Supervisor actions persist (supervisor_actions table) | ✅ table live |
| Hospital pre-alerts / detail / accept-divert (v1 layout) | ✅ render |
| Hospital + supervisor live data via NACDState | ✅ |

### Phase 5 — Dispatch + PSAP · all ✅
PSAP triage wizard, geocoder, caller/patient form, create-incident→realtime,
Mapbox map (v1 + v2 layer), incident list, assign/route/clear, unit picker,
route rendering, new-call modal, heartbeat call sim, sub-500ms realtime.

### Phase 6 — Wall · all ✅
Kiosk route, KPI rail, map, hot incidents, network status, fleet/calls/agents,
legend, auto-refresh + realtime.

### Phase 7 — EMT Mobile
| Item | Status |
|---|---|
| Unit picker | ✅ (web + Expo) |
| Active incident card with full PSAP data | ✅ |
| Status flow buttons | ✅ |
| Vitals capture | ✅ (web + Expo + clinical_observations table) |
| ePCR submit → claim + vitals + clear + free unit | ✅ end-to-end |
| Push notifications (dispatch→push→tap) | ✅ scaffold (needs EAS to fire) |
| Open in Maps / Call buttons | ✅ |
| ePCR signature capture | 🚀 needs signature-canvas dep |
| Offline-first queue | 🚀 |
| Background GPS | 🚀 |
| Camera ePCR photos | 🚀 |
| EAS Build → TestFlight | 🔧 needs Apple/Google accounts |

### Cross-cutting
| Item | Status |
|---|---|
| Sentry (web, server, edge) | ✅ no-op without DSN |
| Vercel Analytics + Speed Insights | ✅ |
| Playwright E2E smoke (9 tests) | ✅ |
| Vitest domain coverage (31 tests) | ✅ |
| GitHub Actions CI (typecheck+test+build) | ✅ green on Node 22 |
| E2E synthetic monitor (every 30 min) | ✅ green |
| docs/architecture.md | ✅ |
| docs/runbooks/ (deploy, rollback, incident, scaling) | ✅ |
| Storybook | 🚀 |
| Daily DB backup | 🔧 Supabase Pro PITR |
| Weekly digest cron → email/Telegram | 🚀 |

---

## ✨ Built beyond the original spec

- `/api/sim/demo` — 10-second scripted PSAP→dispatch→EMT→claim→M-Pesa→KRA replay
- `/api/cron/heartbeat` — single endpoint maintaining the active-incident pool
- `/admin/sim` — click-button operator console with demo replay
- Cmd+K command palette (incidents, claims, units, hospitals, providers, apps)
- `/api/notify/push` — server→Expo push, auto-fired on dispatch assignment
- `/status` — public uptime/ops dashboard
- `/admin/audit` — filterable dispatch_events viewer
- `/admin/flags` — feature flag toggles for stub↔real cutover
- `/admin/pending` — supervisor approval queue
- `/providers/[id]` — provider deep view (fleet + invoicing)
- P1 audio alarm + browser notification on new priority-1
- PWA manifest for /emt (installable without Expo)
- Printable claim PDF (/claims/[id]/print)

---

## 🔜 What I'm building next (no input needed from you)

1. Multi-tab sim leader election — only one open tab drives lifecycle
   progression so N tabs don't race-write.
2. Supervisor actions wired to buttons (whisper/barge/flag_qa write to
   supervisor_actions, show in audit + dispatch awareness strip).
3. Hospital accept/divert pre-alert actions writing to DB.
4. EMT signature capture for ePCR (web canvas; mobile later).

---

## Migrations applied to production Supabase

```
0001_extensions        0007_vitals (claims.vitals jsonb)
0002_core              0008_feature_flags + pending_approvals
0003_seed_hospitals    0009_clinical_observations
0004_realtime          0010_v1_compat (patient_profiles, triage_sessions,
0005_rls_dev                            supervisor_actions/notes, qa_flags)
0006_claims            0011_broaden_source_check
```

All idempotent. Re-running any is safe. Apply new ones with:
`psql "$SUPABASE_DB_URL" -f sql/00XX_name.sql`
