import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Transpile workspace packages — required for Turborepo monorepo.
  transpilePackages: ['@sha-nadc/ui', '@sha-nadc/types', '@sha-nadc/domain'],
  // typedRoutes disabled until all 9 app routes exist (Phase 6+).
  // Re-enable in next.config when /dispatch, /psap, /supervisor etc. land.
  experimental: {},
};

export default config;
