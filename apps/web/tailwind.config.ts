import type { Config } from 'tailwindcss';
import preset from '@sha-nadc/ui/tailwind.config';

// Web app extends the shared UI preset; adds app-local content paths.
const config: Config = {
  ...preset,
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
