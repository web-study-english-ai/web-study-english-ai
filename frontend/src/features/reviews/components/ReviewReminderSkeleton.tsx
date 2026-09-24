export function ReviewReminderSkeleton() {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-white p-4">
      <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-56 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}