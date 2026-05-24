// Fail loud + early if a required env var is missing. Better than a runtime
// 500 deep inside a query.

export function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.includes('YOUR-')) {
    throw new Error(
      `[supabase] env "${name}" is not set or still placeholder. ` +
        `Did you copy apps/web/.env.local.example → .env.local and fill it in? ` +
        `Run: pnpm dlx tsx scripts/check-env.ts`,
    );
  }
  return v;
}
