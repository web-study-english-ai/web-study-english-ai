"use client";

import { cn } from "@/lib/utils";
import { ProgressRange } from "../types/progress_types";
import { RANGE_OPTIONS } from "../utils/progress_range";

interface Props {
  value: ProgressRange;
  onChange: (range: ProgressRange) => void;
}

export function RangeSelector({ value, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="Khoảng thời gian hiển thị"
      className="inline-flex rounded-lg bg-muted p-1"
    >
      {RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            value === opt.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}