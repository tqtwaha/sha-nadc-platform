import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Transpile workspace packages — required for Turborepo monorepo.
  transpilePackages: ['@sha-nadc/ui', '@sha-nadc/types', '@sha-nadc/domain'],
  experimental: {
    typedRoutes: true,
  },
};

export default config;
