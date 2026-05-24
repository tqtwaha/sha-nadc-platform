'use client';

import { useEffect } from 'react';

// Root-level error boundary — catches any unhandled error in an RSC or
// client component. Renders an in-brand fallback and offers a retry.

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    if (typeof console !== 'undefined') {
      console.error('[GlobalError]', error);
    }
  }, [error]);

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="max-w-md w-full border border-line rounded-lg bg-bg1 p-6 text-center">
        <div className="font-display text-xl font-semibold text-t1">Something broke.</div>
        <p className="text-t2 text-sm mt-2">
          The page hit an error. The dispatch backend may be transiently unavailable, or a
          downstream query failed.
        </p>
        {error.digest && (
          <p className="font-mono text-[10px] text-t3 mt-3">digest: {error.digest}</p>
        )}
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-md bg-g/15 hover:bg-g/25 text-g border border-g/40 text-sm font-display font-medium"
          >
            Retry
          </button>
          <a
            href="/"
            className="px-4 py-2 rounded-md bg-bg2 hover:bg-bg3 text-t1 border border-line text-sm font-display font-medium"
          >
            Home
          </a>
        </div>
      </div>
    </main>
  );
}
