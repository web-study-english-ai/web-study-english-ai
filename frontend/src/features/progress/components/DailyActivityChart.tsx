import { DailyActivity } from "../types/progress_types";

export function DailyActivityChart({ data }: { data: DailyActivity[] }) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Chưa có hoạt động nào trong tuần này.
      </p>
    );
  }

  const max = Math.max(1, ...data.flatMap((d) => [d.newWords, d.reviews]));
  // cột có giá trị luôn cao tối thiểu 4% để vẫn nhìn thấy
  const height = (v: number) => (v <= 0 ? 0 : Math.max((v / max) * 100, 4));

  return (
    <div
      className="flex items-end justify-between gap-2"
      role="img"
      aria-label="Biểu đồ hoạt động hàng ngày"
    >
      {data.map((d) => (
        <div
          key={d.day}
          className="flex flex-1 flex-col items-center gap-2"
          title={`${d.day}: ${d.newWords} từ mới, ${d.reviews} lượt ôn`}
        >
          <div className="flex h-32 items-end gap-1">
            <div
              className="w-3 rounded-t bg-teal-500"
              style={{ height: `${height(d.newWords)}%` }}
            />
            <div
              className="w-3 rounded-t bg-primary"
              style={{ height: `${height(d.reviews)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{d.day}</span>
        </div>
      ))}
    </div>
  );
}