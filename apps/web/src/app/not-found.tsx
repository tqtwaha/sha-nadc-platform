import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="font-display text-7xl font-extrabold text-t1 tabular-nums">404</div>
        <div className="font-mono text-[11px] text-t3 uppercase tracking-[0.3em] mt-2">
          Route not found
        </div>
        <p className="text-t2 text-sm mt-4">
          That surface doesn't exist on this deployment. The platform has nine — landing,
          PSAP, dispatch, supervisor, EMT, hospital, claims, providers, admin.
        </p>
        <Link
          href="/"
          className="inline-block mt-6 px-4 py-2 rounded-md bg-g/15 hover:bg-g/25 text-g border border-g/40 text-sm font-display font-medium"
        >
          Back to launchpad
        </Link>
      </div>
    </main>
  );
}
