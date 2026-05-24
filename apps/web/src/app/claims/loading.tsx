export default function ClaimsLoading() {
  return (
    <main className="min-h-screen flex flex-col">
      <div className="h-14 border-b border-line bg-bg1 flex items-center px-5">
        <div className="font-display font-semibold text-[13px] text-t1">NADC · Claims</div>
      </div>
      <section className="flex-1 px-6 py-6 max-w-screen-2xl w-full mx-auto space-y-4">
        <div className="flex gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-7 w-20 rounded-pill bg-bg1 border border-line animate-pulse" />
          ))}
        </div>
        <div className="h-[500px] rounded-lg bg-bg1 border border-line animate-pulse" />
      </section>
    </main>
  );
}
