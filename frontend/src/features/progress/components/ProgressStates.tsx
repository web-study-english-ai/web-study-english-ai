import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProgressSkeleton() {
  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

export function ProgressError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-8 text-center">
      <p className="text-sm text-destructive">Không thể tải thống kê. Vui lòng kiểm tra kết nối.</p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  );
}

export function ProgressEmpty() {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-border bg-white p-12 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <BarChart3 className="h-6 w-6 text-muted-foreground" />
      </span>
      <h2 className="mt-4 font-heading text-lg font-semibold text-foreground">
        Chưa có dữ liệu thống kê
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Hãy học vài từ mới để bắt đầu theo dõi tiến độ của bạn.
      </p>
      <Link
        href="/learn-words"
        className="mt-5 inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Học từ mới
      </Link>
    </div>
  );
}