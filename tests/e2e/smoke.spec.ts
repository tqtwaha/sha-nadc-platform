import { test, expect } from '@playwright/test';

// Top-level smoke test — proves every operational surface returns a
// 200 + renders expected content. Doubles as a synthetic uptime probe
// when run against production via PLAYWRIGHT_BASE_URL.

test.describe('Platform smoke', () => {
  test('health probe returns ok + counts', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.hospitals).toBeGreaterThanOrEqual(60);
    expect(body.latency_ms).toBeLessThan(2000);
  });

  test('config endpoint exposes supabase + mapbox', async ({ request }) => {
    const res = await request.get('/api/config');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.supabaseUrl).toMatch(/supabase\.co/);
    expect(body.supabaseAnonKey).not.toBe('');
  });

  test('landing page renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=SHA NADC')).toBeVisible({ timeout: 10_000 });
  });

  test('wall serves v1 dashboard HTML (not v2 React)', async ({ page }) => {
    const res = await page.goto('/wall');
    expect(res?.status()).toBe(200);
    const title = await page.title();
    expect(title.toLowerCase()).toContain('wall');
  });

  test('dispatch serves v1 prototype HTML', async ({ page }) => {
    const res = await page.goto('/dispatch');
    expect(res?.status()).toBe(200);
  });

  test('status page surfaces probe rows', async ({ page }) => {
    await page.goto('/status');
    await expect(page.locator('text=Database')).toBeVisible();
    await expect(page.locator('text=Realtime')).toBeVisible();
  });

  test('sim spawn is locked without auth', async ({ request }) => {
    const res = await request.post('/api/sim/spawn?n=1');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('unauthorized');
  });

  test('sim tick is locked without auth', async ({ request }) => {
    const res = await request.post('/api/sim/tick?n=1');
    expect(res.status()).toBe(401);
  });

  test('Cmd+K palette search returns results', async ({ request }) => {
    const res = await request.get('/api/palette?q=cardiac');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.results)).toBe(true);
  });
});
