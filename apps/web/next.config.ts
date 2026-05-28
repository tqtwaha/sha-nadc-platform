import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sha-nadc/ui', '@sha-nadc/types', '@sha-nadc/domain'],
  experimental: {},
  async rewrites() {
    // beforeFiles fires BEFORE App Router route matching, so the v1 HTML
    // wins even though v2 React pages still exist at the same slugs.
    // Only exact paths are rewritten — subroutes like /dispatch/[id],
    // /claims/[id], /admin/audit, /emt/[unit], /api/* keep hitting the
    // v2 React handlers and Server Actions underneath.
    return {
      beforeFiles: [
        { source: '/wall', destination: '/legacy/dashboard/index.html' },
        { source: '/dashboard', destination: '/legacy/dashboard/index.html' },
        { source: '/dispatch', destination: '/legacy/dispatch/index.html' },
        { source: '/supervisor', destination: '/legacy/supervisor/index.html' },
        { source: '/emt', destination: '/legacy/emt/index.html' },
        { source: '/psap', destination: '/legacy/psap/index.html' },
        { source: '/hospital', destination: '/legacy/hospital/index.html' },
        { source: '/claims', destination: '/legacy/claims/index.html' },
        { source: '/providers', destination: '/legacy/providers/index.html' },
        { source: '/admin', destination: '/legacy/admin/index.html' },
        { source: '/tracker', destination: '/tracker.html' },
      ],
    };
  },
};

// Sentry wrapper — uses NEXT_PUBLIC_SENTRY_DSN when set. Doesn't break
// builds when DSN is absent (the SDK no-ops).
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG ?? '',
  project: process.env.SENTRY_PROJECT ?? '',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  sourcemaps: {
    // Skip source-map upload when there's no auth token (local dev, fresh CI)
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
