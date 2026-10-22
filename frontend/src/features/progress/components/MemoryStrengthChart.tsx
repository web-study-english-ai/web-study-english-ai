import { MemoryStrengthPoint } from "../types/progress_types";

const W = 640;
const H = 240;
const PAD = { top: 16, right: 20, bottom: 30, left: 48 };
const TICKS = [0, 25, 50, 75, 100];

export function MemoryStrengthChart({ data }: { data: MemoryStrengthPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Chưa đủ dữ liệu để vẽ biểu đồ.
      </p>
    );
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  // Tối đa khoảng 6 nhãn trên trục X, neo theo điểm mới nhất
  const labelStep = Math.max(1, Math.ceil(data.length / 6));

  const x = (i: number) =>
    PAD.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) =>
    PAD.top + innerH - (Math.min(Math.max(v, 0), 100) / 100) * innerH;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Biểu đồ tổng độ bền trí nhớ theo thời gian"
    >
      {TICKS.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(t)}
            y2={y(t)}
            className="stroke-border"
            strokeDasharray="3 4"
          />
          <text
            x={PAD.left - 8}
            y={y(t) + 4}
            textAnchor="end"
            className="fill-muted-foreground text-[11px]"
          >
            {t}%
          </text>
        </g>
      ))}

      <path
        d={line}
        fill="none"
        className="stroke-primary"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {data.length === 1 && (
        <circle cx={x(0)} cy={y(data[0].value)} r={4} className="fill-primary" />
      )}

      {data.map((d, i) => (
        <g key={`${d.label}-${i}`}>
          <circle cx={x(i)} cy={y(d.value)} r={10} fill="transparent">
            <title>{`${d.label}: ${d.value}%`}</title>
          </circle>
          {(data.length - 1 - i) % labelStep === 0 && (
            <text
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {d.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}