import type { Preview } from '@storybook/react-vite';
import './preview.css';

// Load the same web fonts the app uses so type matches.
if (typeof document !== 'undefined') {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700&display=swap';
  document.head.appendChild(link);
}

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'NADC canvas',
      values: [
        { name: 'NADC canvas', value: '#0B0F14' },
        { name: 'Surface', value: '#11161D' },
        { name: 'Light', value: '#ffffff' },
      ],
    },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
};

export default preview;
