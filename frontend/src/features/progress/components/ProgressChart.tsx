import { TotalWordsPoint } from "../types/progress_types";

const W = 640;
const H = 240;
const PAD = { top: 16, right: 20, bottom: 30, left: 44 };

function niceCeil(n: number) {
  if (n <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * pow;
}

export function TotalWordsChart({ data }: { data: TotalWordsPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Chưa đủ dữ liệu để vẽ biểu đồ.
      </p>
    );
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxValue = niceCeil(Math.max(...data.map((d) => d.total)));
  const ticks = Array.from(
    new Set([0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxValue * t)))
  );

  const x = (i: number) =>
    PAD.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / maxValue) * innerH;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.total)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Biểu đồ tổng số từ theo thời gian"
    >
      {ticks.map((t, i) => (
        <g key={i}>
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
            {t}
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

      {data.map((d, i) => (
        <g key={`${d.label}-${i}`}>
          <circle
            cx={x(i)}
            cy={y(d.total)}
            r={4}
            className="fill-white stroke-primary"
            strokeWidth={2}
          >
            <title>{`${d.label}: ${d.total} từ`}</title>
          </circle>
          <text
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}