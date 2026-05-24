'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Wall is a kiosk surface — re-pulls fresh data every `intervalMs` so the
// LED panel stays current without anyone clicking. router.refresh() is
// preferred over a hard reload because it only re-fetches RSC payloads.

export function AutoRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
