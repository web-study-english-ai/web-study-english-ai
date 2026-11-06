import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  legend?: React.ReactNode;
  className?: string;
  isLoading?: boolean;
  children: React.ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  legend,
  className,
  isLoading = false,
  children,
}: ChartCardProps) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {legend && (
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            {legend}
          </div>
        )}
      </div>

      <div className="relative" aria-busy={isLoading}>
        <div className={cn("transition-opacity", isLoading && "pointer-events-none opacity-40")}>
          {children}
        </div>
        {isLoading && (
          <div role="status" className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="sr-only">Đang tải dữ liệu biểu đồ</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function LegendItem({
  colorClass,
  label,
  line,
}: {
  colorClass: string;
  label: string;
  line?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn(line ? "h-0.5 w-4 rounded" : "h-2 w-2 rounded-sm", colorClass)} />
      {label}
    </span>
  );
}