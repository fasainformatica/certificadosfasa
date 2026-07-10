const metricSkeletons = Array.from({ length: 6 }, (_, index) => index);
const rowSkeletons = Array.from({ length: 5 }, (_, index) => index);

export default function InternalLoading() {
  return (
    <section className="grid gap-3" aria-label="Carregando">
      <div className="rounded-3xl border border-blue-100/75 bg-white/90 p-4 shadow-sm shadow-blue-950/5">
        <div className="h-5 w-40 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded-full bg-slate-100" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {metricSkeletons.map((item) => (
          <div key={item} className="rounded-3xl border border-blue-100/75 bg-white/90 p-4 shadow-sm shadow-blue-950/5">
            <div className="h-9 w-9 animate-pulse rounded-2xl bg-blue-100" />
            <div className="mt-5 h-6 w-16 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-3 h-3 w-24 animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-blue-100/75 bg-white/90 p-4 shadow-sm shadow-blue-950/5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="h-5 w-36 animate-pulse rounded-full bg-slate-200" />
          <div className="h-9 w-28 animate-pulse rounded-2xl bg-blue-100" />
        </div>
        <div className="grid gap-2">
          {rowSkeletons.map((item) => (
            <div key={item} className="h-12 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    </section>
  );
}
