// Root-level loading skeleton — shown during any RSC fetch on the
// landing page. Stays out of the way of per-route loaders (they take
// precedence when present).

export default function Loading() {
  return (
    <main className="min-h-screen bg-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-2 h-2 bg-g rounded-full animate-pulse" />
        <div className="font-mono text-[10px] text-t3 uppercase tracking-[0.3em]">
          Loading
        </div>
      </div>
    </main>
  );
}
