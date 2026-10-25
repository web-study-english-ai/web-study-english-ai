import { cn } from "@/lib/utils";
import { DailyActivity } from "../types/progress_types";

export function DailyActivityChart({ data }: { data: DailyActivity[] }) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Chưa có hoạt động nào trong khoảng thời gian này.
      </p>
    );
  }

  const max = Math.max(1, ...data.flatMap((d) => [d.newWords, d.reviews]));
  const height = (v: number) => (v <= 0 ? 0 : Math.max((v / max) * 100, 4));
  const dense = data.length > 7;

  return (
    <div
      className={cn("flex items-end justify-between", dense ? "gap-1" : "gap-2")}
      role="img"
      aria-label="Biểu đồ hoạt động"
    >
      {data.map((d, i) => (
        <div
          key={`${d.day}-${i}`}
          className="flex min-w-0 flex-1 flex-col items-center gap-2"
          title={`${d.day}: ${d.newWords} từ mới, ${d.reviews} lượt ôn`}
        >
          <div className="flex h-32 items-end gap-0.5 sm:gap-1">
            <div
              className={cn("rounded-t bg-teal-500", dense ? "w-1.5 sm:w-2.5" : "w-3")}
              style={{ height: `${height(d.newWords)}%` }}
            />
            <div
              className={cn("rounded-t bg-primary", dense ? "w-1.5 sm:w-2.5" : "w-3")}
              style={{ height: `${height(d.reviews)}%` }}
            />
          </div>
          <span
            className={cn(
              "whitespace-nowrap text-[10px] text-muted-foreground sm:text-xs",
              dense && (data.length - 1 - i) % 2 !== 0 && "max-sm:invisible"
            )}
          >
            {d.day}
          </span>
        </div>
      ))}
    </div>
  );
}