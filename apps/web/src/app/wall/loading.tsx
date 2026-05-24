export default function WallLoading() {
  return (
    <main className="min-h-screen bg-bg text-t1 px-6 py-5 flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 bg-p1 rounded-full animate-pulse" />
          <div className="font-display text-2xl font-semibold">SHA · NADC</div>
        </div>
      </header>
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-bg1 border border-line animate-pulse" />
        ))}
      </div>
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        <div className="col-span-8 rounded-lg bg-bg1 border border-line animate-pulse" />
        <div className="col-span-4 grid grid-rows-2 gap-4">
          <div className="rounded-lg bg-bg1 border border-line animate-pulse" />
          <div className="rounded-lg bg-bg1 border border-line animate-pulse" />
        </div>
      </div>
    </main>
  );
}
