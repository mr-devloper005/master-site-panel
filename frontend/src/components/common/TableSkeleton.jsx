export default function TableSkeleton({ rows = 5 }) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="skeleton h-12 rounded-xl bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
    </div>
  );
}
