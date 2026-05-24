export default function DispatchLoading() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Topbar placeholder */}
      <div className="h-14 border-b border-line bg-bg1 flex items-center px-5">
        <div className="font-display font-semibold text-[13px] text-t1">NADC · Dispatch</div>
      </div>
      <section className="flex-1 px-6 py-6 max-w-screen-2xl w-full mx-auto space-y-4">
        <div className="h-8 rounded-md bg-bg1 border border-line animate-pulse" />
        <div className="h-[420px] rounded-lg bg-bg1 border border-line animate-pulse" />
        <div className="h-[400px] rounded-lg bg-bg1 border border-line animate-pulse" />
      </section>
    </main>
  );
}
