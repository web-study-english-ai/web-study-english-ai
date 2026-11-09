"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SRSRating } from "@/features/vocabulary/types/vocabulary_types";

interface Props {
  disabled: boolean;
  onRate: (rating: SRSRating) => void;
}

const OPTIONS: {
  value: SRSRating;
  label: string;
  className: string;
  key: string;
}[] = [
  { value: "forgot", label: "Chưa nhớ", className: "text-destructive border-destructive/40 hover:bg-destructive/10", key: "1" },
  { value: "hard", label: "Khó", className: "text-yellow-600 border-yellow-300 hover:bg-yellow-50", key: "2" },
  { value: "medium", label: "Bình thường", className: "text-primary border-primary/40 hover:bg-primary/5", key: "3" },
  { value: "easy", label: "Dễ", className: "text-green-600 border-green-300 hover:bg-green-50", key: "4" },
];

const KEY_TO_RATING: Record<string, SRSRating> = Object.fromEntries(
  OPTIONS.map((o) => [o.key, o.value])
);

export function ReviewRatingBar({ disabled, onRate }: Props) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (disabled) return; // chưa lật thẻ hoặc đang gửi → bỏ qua

      // Không bắt phím khi đang gõ trong ô nhập liệu
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;

      // Bỏ qua khi giữ Ctrl/Alt/Meta (vd: Ctrl+1 chuyển tab trình duyệt)
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const rating = KEY_TO_RATING[e.key];
      if (rating) onRate(rating);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, onRate]);

  return (
    <div>
      <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Mức độ ghi nhớ của bạn
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant="outline"
            disabled={disabled}
            className={`h-auto flex-col gap-0.5 py-3 disabled:opacity-40 ${opt.className}`}
            onClick={() => onRate(opt.value)}
          >
            <span className="font-semibold">
              {opt.label} <span className="text-xs opacity-60">({opt.key})</span>
            </span>
          </Button>
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Mẹo: dùng phím <kbd className="rounded bg-muted px-1.5 py-0.5">1</kbd>–
        <kbd className="rounded bg-muted px-1.5 py-0.5">4</kbd> để đánh giá nhanh
      </p>
    </div>
  );
}