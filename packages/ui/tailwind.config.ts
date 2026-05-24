import type { Config } from 'tailwindcss';

// Tailwind v4-style theme tokens bound to the CSS custom properties in
// tokens.css. Apps extend this rather than redefining. Any new colour or
// spacing token lives in tokens.css; this just exposes it to utility classes.
const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    '../../apps/**/src/**/*.{ts,tsx}',
    '../../apps/**/app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:    'var(--bg)',
        bg1:   'var(--bg-1)',
        bg2:   'var(--bg-2)',
        t1:    'var(--t1)',
        t2:    'var(--t2)',
        t3:    'var(--t3)',
        t4:    'var(--t4)',
        line:  'var(--line)',
        line2: 'var(--line-2)',
        b:     'var(--b)',
        b2:    'var(--b2)',
        g:     'var(--g)',
        g2:    'var(--g2)',
        p1:    'var(--p1)',
        p2:    'var(--p2)',
        p3:    'var(--p3)',
        ok:    'var(--ok)',
      },
      borderRadius: {
        sm:   'var(--r-sm)',
        md:   'var(--r-md)',
        lg:   'var(--r-lg)',
        xl:   'var(--r-xl)',
        pill: 'var(--r-pill)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        mono:    'var(--font-mono)',
        cond:    'var(--font-cond)',
      },
      transitionTimingFunction: {
        'ease-out-strong': 'cubic-bezier(0.23, 1, 0.32, 1)',
        snap:              'cubic-bezier(0.16, 1, 0.3, 1)',
        drawer:            'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      boxShadow: {
        s1:    'var(--shadow-1)',
        s2:    'var(--shadow-2)',
        modal: 'var(--shadow-modal)',
      },
    },
  },
  plugins: [],
};

export default config;
