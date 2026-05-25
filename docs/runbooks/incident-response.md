# Runbook · Incident response (security / outage)

## Outage detected (`/status` red or Sentry burst)

1. Confirm scope: hit `/api/health` directly.
   - 503 → Supabase / DB problem (jump to "Supabase outage" below).
   - 200 but UI broken → client-side issue, check Sentry releases.
   - Timeout → Vercel edge problem; check <https://www.vercel-status.com>.

2. If you deployed in the last hour: **rollback first, debug later**.
   See `rollback.md`. Restoration of service beats root-cause analysis.

3. Page the on-call rota if downtime exceeds 5 minutes.

## Supabase outage

- Status page: <https://status.supabase.com>.
- v1 prototypes degrade gracefully (NACDState catches the init error
  and shows a loading overlay).
- v2 detail pages throw → caught by `app/error.tsx` which shows the
  branded error fallback.
- No write succeeds during the outage; the UI's retry button will work
  once the DB returns.

## Suspected security incident

### Signs

- Audit log shows mutations from unfamiliar agent_id.
- `/api/sim/*` 200 responses you didn't initiate.
- Sentry shows unauthorized-access bursts.

### Immediate steps

1. **Engage emergency_lockdown flag** at `/admin/flags`. Stops writes
   platform-wide once we wire Server Actions to honor it (P-2 work).
2. **Rotate `SUPABASE_SERVICE_ROLE_KEY`** in Supabase dashboard. Update
   Vercel env. Redeploy.
3. **Rotate `CRON_SECRET`** if /api/sim/* endpoints were abused.
4. **Rotate `CLERK_SECRET_KEY`** if Clerk session theft suspected.
5. **Snapshot the audit log** for forensics:
   ```sql
   COPY (SELECT * FROM dispatch_events WHERE created_at > '2026-MM-DD')
     TO '/tmp/audit_snapshot.csv' WITH CSV HEADER;
   ```
6. **Notify SHA DPO** within 72 hours per Kenya DPA 2019 if patient
   data was potentially exposed.

### Data residency notes (Kenya DPA 2019)

- Patient health data is sensitive personal data.
- Breach must be notified to data subjects + ODPC within 72 hours.
- Audit trail must be preserved for at least 7 years.
- Cross-border transfer (Supabase eu-central-1) covered by GDPR-equivalent
  contractual safeguards.

## Vercel edge issue

- Vercel status: <https://www.vercel-status.com>.
- If localized to a region, traffic auto-fails over to other PoPs.
- For sustained outages: lift the v1 prototypes onto a backup static
  host (Cloudflare Pages, Netlify) since they're zero-build HTML.

## Communication template

```
[STATUS] sha-nadc-platform — investigating
Detected:  YYYY-MM-DD HH:MM UTC
Impact:    <what users see>
Scope:     <which surfaces affected>
Next update: HH:MM UTC

[STATUS] sha-nadc-platform — resolved
Resolved:  YYYY-MM-DD HH:MM UTC
Cause:     <one-sentence root cause>
Mitigation: <what fixed it>
Postmortem due: <date>
```

## Postmortem cadence

Every Sev-1 (full outage > 15 min) or Sev-2 (degraded > 1h) gets a
blameless postmortem within 48 hours. Template:

- Timeline (UTC)
- Detection method
- User impact
- Root cause
- What went well / poorly
- Action items with owners + dates
