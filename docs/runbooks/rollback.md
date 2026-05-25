# Runbook · Rollback

## Symptom: a deploy broke production

### Option A — Promote a previous deploy (fastest)

1. Vercel dashboard → project → Deployments tab.
2. Find the last green deploy.
3. Click `…` → **Promote to Production**.
4. Wait ~10s. Production now serves that deploy.
5. Verify with `/status` + `pnpm test:e2e`.

### Option B — Git revert + redeploy

```bash
git log --oneline -10                  # find the bad commit
git revert <bad-sha>                   # creates an inverse commit
git push origin main                   # triggers Vercel build
```

Takes ~90s. Cleaner audit trail.

## Symptom: a SQL migration broke things

Roll forward, not backward. Database rollbacks are tricky — write a
`sql/0010_fix.sql` that undoes what `0009` did.

```sql
-- sql/0010_revert_0009.sql
ALTER TABLE claims DROP COLUMN IF EXISTS broken_column;
```

Then apply via psql as in `deploy.md`.

## Symptom: emergency lockdown needed

`/admin/flags` → flip `emergency_lockdown` ON. Reads continue; writes
should be blocked by the application (currently Server Actions don't
check this flag — TODO: wire `killSwitchEngaged()` from `lib/flags.ts`
into every mutation Server Action before P-2 ships).

## Symptom: sim runaway (too many incidents created)

```bash
# Stop the cron
# /admin/flags → toggle sim_auto_tick OFF

# Clear the backlog
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     "https://sha-nadc-platform-web.vercel.app/api/sim/reset?keep=0&wipeClaims=true&wipeEvents=true"

# Verify
curl -sS "https://sha-nadc-platform-web.vercel.app/api/health"
```

## Symptom: stuck in build loop

If Vercel keeps deploying the same commit due to transient failures:

1. Vercel dashboard → project → Deployments.
2. Cancel any pending builds.
3. Make a tiny no-op change (touch `README.md`), commit, push. Forces
   a fresh build.

## Recovery: lost local work

Hardware failure or accidental `git reset --hard`. The remote always
has the last pushed state.

```bash
git fetch origin
git reset --hard origin/main
pnpm install
```
