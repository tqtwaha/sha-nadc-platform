#!/usr/bin/env tsx
/**
 * scripts/check-env.ts
 *
 * Validates apps/web/.env.local without ever printing the actual secret
 * values to stdout. Only reports presence + reachability + auth.
 *
 *   pnpm dlx tsx scripts/check-env.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_PATH = resolve(process.cwd(), 'apps/web/.env.local');

type Check = { name: string; ok: boolean; detail?: string };

function loadDotenv(path: string): Record<string, string> {
  if (!existsSync(path)) {
    console.error(`✗ ${path} not found.`);
    console.error('  Run: cd apps/web && cp .env.local.example .env.local');
    process.exit(1);
  }
  const env: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function mask(s: string | undefined): string {
  if (!s) return '(empty)';
  if (s.length < 12) return '***';
  return `${s.slice(0, 6)}…${s.slice(-4)} (len ${s.length})`;
}

// Match only the exact tokens shipped in .env.local.example — not any
// occurrence of "YOUR-" / "your-" which would false-positive against legit
// values (region slugs, hashed strings, etc.).
const PLACEHOLDER_TOKENS = [
  'YOUR-PROJECT-REF',
  'YOUR-PASSWORD',
  'YOUR-PROJECT-REF.supabase.co',
  'your-jwt-secret',
  'AIza...',
  'sntrys_',
];
function isPlaceholder(v: string | undefined): boolean {
  if (!v) return true;
  return PLACEHOLDER_TOKENS.some((t) => v.includes(t));
}

async function main() {
  const env = loadDotenv(ENV_PATH);
  const checks: Check[] = [];

  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DB_URL',
    'SUPABASE_JWT_SECRET',
    'SUPABASE_PROJECT_REF',
  ];

  for (const k of required) {
    const v = env[k];
    if (!v) checks.push({ name: k, ok: false, detail: 'missing' });
    else if (isPlaceholder(v))
      checks.push({ name: k, ok: false, detail: 'still placeholder value' });
    else checks.push({ name: k, ok: true, detail: `set · ${mask(v)}` });
  }

  // Reachability — call the auth settings endpoint with the anon key.
  // This is public on every Supabase project regardless of RLS state.
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon && !isPlaceholder(url) && !isPlaceholder(anon)) {
    try {
      const r = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, {
        headers: { apikey: anon },
      });
      checks.push({
        name: 'Anon key valid (auth/v1/settings)',
        ok: r.status === 200,
        detail: `HTTP ${r.status}${r.status !== 200 ? ' — anon key likely wrong' : ''}`,
      });
    } catch (e) {
      checks.push({
        name: 'Anon key check',
        ok: false,
        detail: (e as Error).message,
      });
    }
  }

  // Service-role validity — hit /auth/v1/admin/users (requires service-role JWT).
  const svc = env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && svc && !isPlaceholder(svc)) {
    try {
      const r = await fetch(`${url.replace(/\/$/, '')}/auth/v1/admin/users?per_page=1`, {
        headers: { apikey: svc, Authorization: `Bearer ${svc}` },
      });
      checks.push({
        name: 'Service-role key accepted by /auth/v1/admin',
        ok: r.status === 200,
        detail: `HTTP ${r.status}${r.status !== 200 ? ' — likely wrong key' : ''}`,
      });
    } catch (e) {
      checks.push({
        name: 'Service-role check',
        ok: false,
        detail: (e as Error).message,
      });
    }
  }

  // DB URL — only check parse-ability; we don't run psql from here so users
  // without psql installed still pass. Phase 1 migrations will exercise it.
  const db = env.SUPABASE_DB_URL;
  if (db) {
    try {
      const u = new URL(db);
      const okShape =
        u.protocol === 'postgresql:' &&
        u.hostname.endsWith('.pooler.supabase.com') &&
        u.port === '5432' &&
        u.username.startsWith('postgres');
      checks.push({
        name: 'SUPABASE_DB_URL shape',
        ok: okShape,
        detail: okShape
          ? `session pooler host ${u.hostname.split('.')[0]}…, port ${u.port}`
          : 'looks wrong — should be the URI from "Session pooler" tab in Supabase dashboard',
      });
    } catch {
      checks.push({ name: 'SUPABASE_DB_URL shape', ok: false, detail: 'not a valid URL' });
    }
  }

  // Project ref shape
  const ref = env.SUPABASE_PROJECT_REF;
  if (ref) {
    const ok = /^[a-z0-9]{20}$/.test(ref);
    checks.push({
      name: 'SUPABASE_PROJECT_REF shape',
      ok,
      detail: ok ? `20 lowercase chars · ${ref}` : 'expected 20 lowercase alphanumerics',
    });
  }

  // Report
  console.log('\nSupabase env check —', ENV_PATH, '\n');
  let allOk = true;
  for (const c of checks) {
    const mark = c.ok ? '✓' : '✗';
    const color = c.ok ? '\x1b[32m' : '\x1b[31m';
    console.log(`  ${color}${mark}\x1b[0m  ${c.name.padEnd(46)} ${c.detail ?? ''}`);
    if (!c.ok) allOk = false;
  }
  console.log();
  if (!allOk) process.exit(1);
}

main().catch((e) => {
  console.error('check-env failed:', e);
  process.exit(2);
});
