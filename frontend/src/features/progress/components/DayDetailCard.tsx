"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDayDetail } from "../hooks/useDayDetail";

const RATING_META = {
  forgot: { label: "Chưa nhớ", className: "text-destructive" },
  hard: { label: "Khó", className: "text-yellow-600" },
  medium: { label: "Bình thường", className: "text-primary" },
  easy: { label: "Dễ", className: "text-green-600" },
} as const;

// Dùng giờ địa phương, tránh toISOString() lệch sang ngày hôm trước
function toLocalISO(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatLongDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

export function DayDetailCard() {
  const today = toLocalISO(new Date());
  const [date, setDate] = useState(today);
  const { data, isLoading, isError, refetch } = useDayDetail(date);

  const hasActivity = data && (data.newWords > 0 || data.reviews > 0);

  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">
            Chi tiết theo ngày
          </h2>
          <p className="mt-0.5 text-xs capitalize text-muted-foreground">{formatLongDate(date)}</p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="day-picker" className="sr-only">
            Chọn ngày
          </label>
          <input
            id="day-picker"
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={date === today}
            onClick={() => setDate(today)}
          >
            Hôm nay
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3" aria-busy="true">
          <div className="grid grid-cols-2 gap-3">
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
          </div>
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-center">
          <p className="text-sm text-destructive">Không thể tải chi tiết ngày này.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Thử lại
          </Button>
        </div>
      )}

      {data && !hasActivity && (
        <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          Bạn chưa học hoặc ôn từ nào trong ngày này.
        </p>
      )}

      {data && hasActivity && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-teal-50 p-4">
              <p className="text-xs text-muted-foreground">Từ mới</p>
              <p className="font-heading text-2xl font-bold text-teal-600">{data.newWords}</p>
            </div>
            <div className="rounded-xl bg-orange-50 p-4">
              <p className="text-xs text-muted-foreground">Lượt ôn tập</p>
              <p className="font-heading text-2xl font-bold text-primary">{data.reviews}</p>
            </div>
          </div>

          {data.words.length > 0 && (
            <ul className="mt-4 max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {data.words.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-sm",
                        w.kind === "new" ? "bg-teal-500" : "bg-primary"
                      )}
                    />
                    <span className="font-medium text-foreground">{w.word}</span>
                    <span className="text-xs text-muted-foreground">
                      {w.kind === "new" ? "Học mới" : "Ôn tập"}
                    </span>
                  </span>
                  {w.rating && (
                    <span className={cn("text-xs font-medium", RATING_META[w.rating].className)}>
                      {RATING_META[w.rating].label}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}