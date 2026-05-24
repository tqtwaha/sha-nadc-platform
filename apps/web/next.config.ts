import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sha-nadc/ui', '@sha-nadc/types', '@sha-nadc/domain'],
  experimental: {},
  async rewrites() {
    // Serve the v1 HTML prototypes from public/legacy/* at their original
    // slugs. /wall also points to dashboard since v1 didn't have a
    // separate "wall" route. v2-only routes (/admin/audit, /claims/[id],
    // /dispatch/[id], /api/*, /sign-in) keep working because the rewrite
    // only matches the exact paths listed below.
    return [
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
    ];
  },
};

export default config;
