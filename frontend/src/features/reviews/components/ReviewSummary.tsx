"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { SRSRating } from "@/features/vocabulary/types/vocabulary_types";

interface Props {
  totalCards: number;
  elapsedLabel: string;
  ratingCounts: Record<SRSRating, number>;
}

const ROWS: { value: SRSRating; label: string; className: string }[] = [
  { value: "forgot", label: "Chưa nhớ", className: "text-destructive bg-destructive/10" },
  { value: "hard", label: "Khó", className: "text-yellow-600 bg-yellow-50" },
  { value: "medium", label: "Bình thường", className: "text-primary bg-primary/10" },
  { value: "easy", label: "Dễ", className: "text-green-600 bg-green-50" },
];

export function ReviewSummary({ totalCards, elapsedLabel, ratingCounts }: Props) {
  const totalRatings = ROWS.reduce((sum, r) => sum + ratingCounts[r.value], 0);

  return (
    <div className="mt-8 rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
      <h2 className="font-heading text-xl font-semibold text-foreground">
        🎉 Bạn đã ôn xong {totalCards} từ đến hạn hôm nay!
      </h2>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1 rounded-full bg-muted px-3 py-1">
          <Clock className="h-3.5 w-3.5" />
          Thời gian: {elapsedLabel}
        </span>
        <span className="rounded-full bg-muted px-3 py-1">
          Tổng lượt đánh giá: {totalRatings}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ROWS.map((r) => (
          <div key={r.value} className={`rounded-xl px-3 py-4 ${r.className}`}>
            <p className="text-2xl font-bold">{ratingCounts[r.value]}</p>
            <p className="mt-1 text-xs font-medium">{r.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/learn-words"
          className="rounded-full bg-primary px-6 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Học từ mới
        </Link>
        <Link
          href="/vocabulary"
          className="rounded-full border border-border px-6 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Quản lý từ vựng
        </Link>
      </div>
    </div>
  );
}
