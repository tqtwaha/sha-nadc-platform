import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';

// Two-mode middleware:
//   - With Clerk keys: gate every route except /sign-in, /sign-up, /api/sim/*,
//     /api/health. Sign-in redirects unauthenticated visitors.
//   - Without Clerk keys (no NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in env):
//     no-op so the platform stays a fully open demo. This lets Vercel
//     deployments without auth configured keep working — useful before
//     the customer has provisioned a Clerk app.

const PUBLIC = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/sim/(.*)',
  '/api/health(.*)',
  '/api/config(.*)',     // v1 NACDState boot needs this even when gated
  '/legacy/(.*)',         // v1 prototype HTML + assets
  '/lib/(.*)',            // v1 NACDState scripts
  '/assets/(.*)',         // v1 token + favicon assets
]);

const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const gated = clerkMiddleware(async (auth, req) => {
  if (PUBLIC(req)) return;
  await auth.protect();
});

export default function middleware(req: NextRequest) {
  if (!clerkConfigured) return NextResponse.next();
  return gated(req, {} as never);
}

export const config = {
  matcher: [
    // Skip Next internals + static files. Always run for API routes.
    '/((?!_next|.*\\..*).*)',
    '/(api|trpc)(.*)',
  ],
};
