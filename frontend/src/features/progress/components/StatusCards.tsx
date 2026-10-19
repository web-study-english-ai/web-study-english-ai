import { CardStatusCounts } from "../types/progress_types";

const SIZE = 160;
const CENTER = SIZE / 2;
const R = 56;
const STROKE = 22;
const CIRCUMFERENCE = 2 * Math.PI * R;

const SEGMENTS = [
  { key: "mastered", label: "Đã thuộc", stroke: "stroke-teal-500", dot: "bg-teal-500" },
  { key: "learning", label: "Đang học", stroke: "stroke-orange-400", dot: "bg-orange-400" },
  { key: "notLearned", label: "Chưa học", stroke: "stroke-slate-200", dot: "bg-slate-200" },
] as const;

export function StatusCard({ counts }: { counts: CardStatusCounts }) {
  const total = counts.mastered + counts.learning + counts.notLearned;

  const lengths = SEGMENTS.map((s) =>
    total > 0 ? (counts[s.key] / total) * CIRCUMFERENCE : 0
  );
  const offsets = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-40 w-40 shrink-0"
        role="img"
        aria-label="Biểu đồ phân bố trạng thái thẻ"
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-muted"
        />
        {SEGMENTS.map((s, i) => (
          <circle
            key={s.key}
            cx={CENTER}
            cy={CENTER}
            r={R}
            fill="none"
            strokeWidth={STROKE}
            className={s.stroke}
            strokeDasharray={`${lengths[i]} ${CIRCUMFERENCE - lengths[i]}`}
            strokeDashoffset={-offsets[i]}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
          />
        ))}
      </svg>

      <ul className="space-y-2 text-sm">
        {SEGMENTS.map((s) => {
          const pct = total > 0 ? Math.round((counts[s.key] / total) * 100) : 0;
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-sm ${s.dot}`} />
              <span className="text-foreground">
                {s.label} ({pct}%)
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}