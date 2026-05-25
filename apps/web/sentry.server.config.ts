// Server-side Sentry for Server Components, Route Handlers, Server Actions.
// No-op if NEXT_PUBLIC_SENTRY_DSN is unset.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  });
}
