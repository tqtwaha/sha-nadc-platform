# Runbook · Deploy

## TL;DR

```bash
git push origin main
# Vercel auto-builds + deploys in ~60-90 seconds
```

Vercel watches `main` and triggers a deploy on every push. Build status
visible at <https://vercel.com/dashboard>. Build artifacts live for the
lifetime of the Vercel project.

## Pre-flight checklist

Before pushing to `main`:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (unit)
- [ ] `pnpm -w turbo run build --filter=@sha-nadc/web` passes locally
- [ ] If you touched any SQL: it's been applied to production Supabase
- [ ] If you added a new env var: it's set in Vercel **all three
      environments** (Production / Preview / Development)
- [ ] If it's a `NEXT_PUBLIC_*` var: redeploy after adding (vars inlined
      at build time)
- [ ] If you added a new dep: `pnpm-lock.yaml` is committed in the
      same commit (else Vercel fails `--frozen-lockfile`)

## SQL migrations

Migrations live in `sql/0001*.sql` through `sql/0008_feature_flags.sql`.
Apply against production:

```bash
set -a && source apps/web/.env.local && set +a
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f sql/0009_new_migration.sql
```

Migrations are idempotent (CREATE … IF NOT EXISTS, ALTER … ADD COLUMN
IF NOT EXISTS, ON CONFLICT DO NOTHING). Re-running a migration is safe.

## After a deploy

1. Wait ~60s for Vercel build to complete.
2. Smoke test: `pnpm test:e2e` (hits production, 9 tests in ~15s).
3. Eyeball `/status` — all rows should be green or info.
4. Check `/admin/audit` for any error events from the deploy.

## Rolling back

See `rollback.md`.

## Cron schedule

`vercel.json` defines `/api/cron/heartbeat` at `0 5 * * *` (05:00 UTC
= 08:00 EAT, once daily on Hobby tier). Cron status visible in Vercel
project → Cron Jobs tab.

To pause cron: flip the `sim_auto_tick` feature flag OFF in
`/admin/flags` — the heartbeat endpoint will no-op for that call.
