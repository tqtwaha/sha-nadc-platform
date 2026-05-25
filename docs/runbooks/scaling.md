# Runbook · Scaling

## Current sizing (Hobby + free tiers)

| Layer | Tier | Limits | Headroom |
|---|---|---|---|
| Vercel | Hobby | 100GB bandwidth/mo, 100k function invocations | ~1k DAU |
| Supabase | Free | 500MB DB, 1GB storage, 2GB egress/mo, 50k MAU | ~500 DAU |
| Clerk | Free | 10k MAU | ~1k DAU |
| Sentry | Free | 5k errors/mo, 10k transactions/mo | ~100 errors/day |
| Mapbox | Free | 50k web map loads/mo | ~1.6k page loads/day |

Above ~500 concurrent users in Nairobi alone, upgrade Supabase first.

## Step-by-step upgrade path

### Stage 1 — ~1,000 DAU
- Supabase **Pro** ($25/mo): 8GB DB + read replicas + daily backups.
- Vercel **Pro** ($20/mo/seat): 1TB bandwidth, advanced analytics,
  unlimited cron frequency (allows minute-by-minute heartbeat).
- Sentry **Team** ($26/mo): 50k errors, retain replays 30 days.

### Stage 2 — ~10,000 DAU (national rollout begins)
- Supabase **Team** ($599/mo): 8 vCPU, 16GB RAM, point-in-time recovery.
- Add Supabase Edge Functions for any heavy server-side work (currently
  none — Server Actions handle everything via Vercel).
- Move Mapbox onto a paid plan ($499/mo): 1M map loads + premium tiles.
- Add Redis (Upstash free tier) for distributed rate limiting on
  /api/sim/*.

### Stage 3 — Multi-region (>10k DAU)
- Supabase **Enterprise**: dedicated infra, sub-region within Africa
  (when available; currently nearest is eu-central-1).
- Cloudflare Workers in front for edge caching + DDoS shield.
- Move static v1 HTML to Cloudflare R2 (zero egress).
- Vercel **Enterprise** for SLA.

## Database scaling

The hot tables are `incidents`, `fleet_units`, `dispatch_events`.

### Read scaling

Realtime subscriptions are LISTEN/NOTIFY-cheap; thousands of
subscribers on a single Realtime endpoint is fine on Supabase Pro.

For analytics queries (`/supervisor`, `/admin/audit`), at scale move
the heavy aggregations to materialized views refreshed every minute:

```sql
CREATE MATERIALIZED VIEW supervisor_kpi_5m AS
  SELECT … FROM incidents WHERE created_at > NOW() - INTERVAL '5 min'
  GROUP BY priority, status;

CREATE INDEX ON supervisor_kpi_5m (priority);

-- Refresh trigger every minute (pg_cron)
SELECT cron.schedule('refresh_supervisor_kpi', '* * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY supervisor_kpi_5m');
```

### Write scaling

`dispatch_events` is the highest-volume table (every state change writes
a row). At >100 writes/sec, partition by month:

```sql
CREATE TABLE dispatch_events_2026_06 PARTITION OF dispatch_events
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
```

## Realtime fanout

Supabase Realtime broadcasts each change to all subscribed clients.
At >1000 concurrent dashboard viewers, consider:

- **Filtered subscriptions** — `/wall` only needs `priority IN (1, 2)`
  events, not P3-4. Use `filter` on the subscribe call.
- **Channel sharding** — separate channels per county for multi-tenant
  county rollout (Phase 8+).

## Map tile scaling

Mapbox bills per session, not per load. /wall (kiosk) = 1 session/day.
/dispatch (dispatcher seat) = ~8 sessions/shift. EMT crew (mobile)
~ 4 sessions/shift.

For 100 dispatchers + 270 ambulance crews on a typical day:
- ~800 dispatcher sessions/day
- ~1080 EMT sessions/day
- ~24 wall sessions/day (assume 1 per LED wall, 24 walls nationally)

= ~1900 sessions/day = ~57k/month. Hovers near the 50k free tier; bump
to Mapbox $499/mo plan at national rollout.

## Cost forecast (monthly USD)

| DAU | Vercel | Supabase | Clerk | Sentry | Mapbox | Total |
|---|---|---|---|---|---|---|
| 100 | $0 | $0 | $0 | $0 | $0 | **$0** |
| 1,000 | $20 | $25 | $0 | $26 | $0 | **$71** |
| 10,000 | $20 | $599 | $25 | $80 | $499 | **$1,223** |
| 100,000 | $200 (Ent) | $2,500+ (custom) | $200 | $200 | $1,000 | **~$4,100** |

Production at SHA scale (47 counties × ~5 dispatchers + 270 ambulance
crews = ~500 concurrent users typical, 2,000 peak) lands at Stage 2
pricing. Budget $1,500/mo for infrastructure.
