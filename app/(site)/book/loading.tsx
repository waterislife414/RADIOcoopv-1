export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-6" aria-busy="true">
      <div className="h-2.5 rounded-full bg-slate-200" />
      <div className="mt-6 h-9 w-2/3 animate-pulse rounded bg-slate-200" />
      <div className="mt-4 h-20 animate-pulse rounded-xl bg-slate-100" />
      <div className="mt-4 h-20 animate-pulse rounded-xl bg-slate-100" />
      <span className="sr-only">Loading booking</span>
    </div>
  );
}
