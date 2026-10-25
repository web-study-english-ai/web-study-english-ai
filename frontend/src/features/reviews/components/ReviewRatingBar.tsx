"use client";

import { Button } from "@/components/ui/button";
import { SRSRating } from "@/features/vocabulary/types/vocabulary_types";

interface Props {
  disabled: boolean;
  onRate: (rating: SRSRating) => void;
}

const OPTIONS: {
  value: SRSRating;
  label: string;
  hint: string;
  className: string;
}[] = [
  { value: "forgot", label: "Chưa nhớ", hint: "Ôn lại ngay", className: "text-destructive border-destructive/40 hover:bg-destructive/10" },
  { value: "hard", label: "Khó", hint: "Ôn sau 1 ngày", className: "text-yellow-600 border-yellow-300 hover:bg-yellow-50" },
  { value: "medium", label: "Bình thường", hint: "Ôn sau 3 ngày", className: "text-primary border-primary/40 hover:bg-primary/5" },
  { value: "easy", label: "Dễ", hint: "Ôn sau 7 ngày", className: "text-green-600 border-green-300 hover:bg-green-50" },
];

export function ReviewRatingBar({ disabled, onRate }: Props) {
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
            <span className="font-semibold">{opt.label}</span>
            <span className="text-xs font-normal text-muted-foreground">{opt.hint}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}