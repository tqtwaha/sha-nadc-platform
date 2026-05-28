import type { StorybookConfig } from '@storybook/react-vite';
import tailwind from '@tailwindcss/vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // Process Tailwind v4 via its Vite plugin so the design-token utility
  // classes (bg-bg1, text-t1, …) resolve in the preview iframe.
  viteFinal: async (cfg) => {
    cfg.plugins = cfg.plugins ?? [];
    cfg.plugins.push(tailwind());
    return cfg;
  },
};

export default config;
