import { Button } from "@/components/ui/button";

export function ProfileSkeleton() {
  return (
    
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-64 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
  );
}

export function ProfileError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-8 text-center">
      <p className="text-sm text-destructive">Không thể tải hồ sơ. Vui lòng kiểm tra kết nối.</p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  );
}