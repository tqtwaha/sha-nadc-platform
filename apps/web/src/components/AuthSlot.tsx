'use client';

import Link from 'next/link';
import { useAuth, UserButton } from '@clerk/nextjs';

// Floating account indicator pinned to the top-right corner. Reads
// NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY at build time — when unset, returns
// null so the demo runs clean without Clerk configured.

const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function AuthSlot() {
  if (!clerkConfigured) return null;
  return <AuthSlotInner />;
}

function AuthSlotInner() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;

  return (
    <div className="fixed top-2.5 right-3 z-[60] flex items-center gap-2">
      {isSignedIn ? (
        <UserButton
          appearance={{
            elements: {
              userButtonAvatarBox: { width: 28, height: 28 },
              userButtonOuterIdentifier: { fontSize: 12 },
            },
          }}
        />
      ) : (
        <Link
          href="/sign-in"
          className="px-3 py-1.5 rounded-md bg-g/15 hover:bg-g/25 text-g border border-g/40 text-xs font-display font-medium"
        >
          Sign in
        </Link>
      )}
    </div>
  );
}
