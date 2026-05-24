# Supabase v2 setup guide

One-time setup for the v2 Supabase project. Takes ~10 minutes. Run this
once per environment (dev, staging, prod) — each gets its own Supabase
project so blast radius stays small.

## Step 1 — Copy the env template

```bash
cd apps/web
cp .env.local.example .env.local
```

`.env.local` is gitignored. Never commit it.

## Step 2 — Fill in each variable

Open https://supabase.com/dashboard and select your project. Then for
each variable in `.env.local`, find its source below.

### `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

| Where | Project Settings → API |
|---|---|
| Field | Project URL → into `NEXT_PUBLIC_SUPABASE_URL` |
| Field | Project API keys → row labelled `anon` `public` → click "copy" → into `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

These are **safe** in the browser. Public clients (the web UI, the EMT
app) sign requests with the anon key and Postgres RLS decides what they're
allowed to read or write.

### `SUPABASE_SERVICE_ROLE_KEY`

| Where | Project Settings → API → Project API keys |
|---|---|
| Field | Row labelled `service_role` `secret` → "Reveal" → copy |

**Never** put this in any variable prefixed `NEXT_PUBLIC_`. It bypasses
RLS — anyone with this key can read or write anything in the database.
Used only by server-side code: cron jobs, the sim seeder, admin
operations.

### `SUPABASE_DB_URL` (for psql + migrations)

| Where | Project Settings → Database → Connection string → URI tab |
|---|---|
| Tab | Pick **Session pooler** (NOT Transaction pooler). |

Why session pooler:
- Works over IPv4 (direct connection on port 5432 is IPv6-only)
- Preserves connection state, which matters for migrations and DO blocks
- Same pattern v1 uses successfully

The URI looks like:
```
postgresql://postgres.PROJECT-REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

The password is whatever you set when creating the project. If you don't
remember it: Settings → Database → "Reset database password". Save the new
one somewhere safe — Supabase only shows it once.

### `SUPABASE_JWT_SECRET`

| Where | Project Settings → API → JWT Settings |
|---|---|
| Field | "JWT Secret" → reveal → copy |

Used for server-side verification of JWTs the Supabase Auth (or our Clerk
bridge in Phase 1) issues. Sensitive — don't paste into chat or commit.

### `SUPABASE_PROJECT_REF`

The 20-character slug visible in your dashboard URL:

```
https://supabase.com/dashboard/project/eamptuusflzxxqdtwzef
                                       ^^^^^^^^^^^^^^^^^^^^
                                       this is the project ref
```

Also shown under Settings → General → Reference ID. Used by the Supabase
CLI for migrations (next phase) and by Edge Functions.

## Step 3 — Verify

From the repo root:

```bash
pnpm dlx tsx scripts/check-env.ts
```

(Script lands in next commit — it'll just `console.log` whether each
variable is set and ping the Supabase health endpoint to confirm the
URL + anon key are valid.)

## Step 4 — Mirror to Vercel

Once `.env.local` works on your machine, mirror the same values into
Vercel so deployed previews and production can read them.

| Where | Vercel dashboard → your project → Settings → Environment Variables |
|---|---|
| Per variable | Name, value, and which environments (Development / Preview / Production) |

For the four required variables, recommended scope:

| Variable | Dev | Preview | Prod |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ✓ | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ | ✓ |
| `SUPABASE_DB_URL` | ✓ (your local) | — | — *(prod uses pooled connection from server functions, not psql)* |
| `SUPABASE_JWT_SECRET` | ✓ | ✓ | ✓ |
| `SUPABASE_PROJECT_REF` | ✓ | ✓ | ✓ |

Different Supabase projects per environment is the right pattern when
you have the time — for the demo you can point all three environments at
the same dev project. We split them at staging/prod time.

## Rotation policy (for later)

If a key leaks:
1. Supabase dashboard → Settings → API → reveal → "Generate new key" for
   the affected key (anon or service-role). The old key becomes invalid
   immediately.
2. Update `.env.local` and Vercel env vars.
3. If the leak was a service-role key, rotate the `SUPABASE_JWT_SECRET`
   too (Settings → API → JWT Settings → "Generate new secret"). This
   invalidates every issued session — every user signs in again.
