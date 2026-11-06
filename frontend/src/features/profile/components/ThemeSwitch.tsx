"use client";

import { cn } from "@/lib/utils";

interface Props {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

export function ThemeSwitch({ id, checked, onChange }: Props) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-muted/70 px-3 py-2.5">
      <div>
        <p className="text-sm font-semibold text-foreground">Dark mode</p>
        <p className="text-xs text-muted-foreground">Tối ưu cho đọc đêm</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Dark mode"
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30"
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform",
            checked && "translate-x-5"
          )}
        />
      </button>
    </div>
  );
}