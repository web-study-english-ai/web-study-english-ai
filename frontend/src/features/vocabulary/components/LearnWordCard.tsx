"use client";

import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { POS_LABEL, SRSRating, DeckCard } from "../types/vocabulary_types";
import { CardImage } from "@/components/shared/CardImage";

interface Props {
  card: DeckCard;
  onRate: (rating: SRSRating) => void;
  disabled?: boolean; // true khi popup "quay lại" đang mở → chặn phím tắt
}

const RATING_OPTIONS: {
  value: SRSRating;
  label: string;
  hint: string;
  className: string;
  key: string;
}[] = [
    { value: "forgot", label: "Chưa nhớ", hint: "Xem lại ngay", className: "text-destructive border-destructive/40 hover:bg-destructive/10", key: "1" },
    { value: "hard", label: "Khó", hint: "Xem lại sớm", className: "text-yellow-600 border-yellow-300 hover:bg-yellow-50", key: "2" },
    { value: "medium", label: "Bình thường", hint: "Thời gian chuẩn", className: "text-primary border-primary/40 hover:bg-primary/5", key: "3" },
    { value: "easy", label: "Dễ", hint: "Giãn cách xa", className: "text-green-600 border-green-300 hover:bg-green-50", key: "4" },
  ];

export function LearnWordCard({ card, onRate, disabled = false }: Props) {
  const [flipped, setFlipped] = useState(false);

  // Space / Enter để lật thẻ
  useEffect(() => {
    if (disabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== " " && e.key !== "Enter") return;
      if (e.repeat) return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

      // Không bắt phím khi đang gõ, focus vào link/nút (để nút tự xử lý)
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.tagName === "A" ||
          el.tagName === "BUTTON" ||
          el.isContentEditable)
      )
        return;

      e.preventDefault(); // tránh Space cuộn trang
      setFlipped((f) => !f);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled]);

  function speak(e: React.MouseEvent) {
    e.stopPropagation();
    const utter = new SpeechSynthesisUtterance(card.word.term);
    utter.lang = "en-US";
    window.speechSynthesis.speak(utter);
  }

  function handleRate(rating: SRSRating) {
    onRate(rating);
    setFlipped(false);
  }

  return (
    <div>
      <div
        onClick={() => setFlipped((f) => !f)}
        className="relative h-72 cursor-pointer [perspective:1000px]"
      >
        <div
          className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
          style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-6 text-center shadow-sm [backface-visibility:hidden]">
            <h2 className="font-heading text-4xl font-bold text-foreground">{card.word.term}</h2>
            <div className="mt-2 flex items-center justify-center gap-2 text-muted-foreground">
              {card.word.ipa && <span>{card.word.ipa}</span>}
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                {POS_LABEL[card.word.pos]}
              </span>
              <button
                onClick={speak}
                className="text-primary"
                aria-label="Phát âm"
              >
                <Volume2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-center gap-2 text-muted-foreground">
              {/* giữ nguyên ipa, loại từ, nút phát âm */}
            </div>
            <CardImage
              src={card.imageUrl}
              alt={`Ảnh bạn đã chụp: ${card.word.term}`}
              className="mt-3 max-h-24"
            />
            <p className="mt-4 text-xs text-muted-foreground">
              Bấm vào thẻ hoặc nhấn{" "}
              <kbd className="rounded bg-muted px-1.5 py-0.5">Space</kbd> /{" "}
              <kbd className="rounded bg-muted px-1.5 py-0.5">Enter</kbd> để xem nghĩa
            </p>
          </div>

          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-primary/30 bg-primary/5 p-10 text-center shadow-sm [backface-visibility:hidden]"
            style={{ transform: "rotateY(180deg)" }}
          >
            <p className="text-lg font-semibold text-primary">{card.word.meaningVi}</p>
            <p className="mt-3 text-sm italic text-muted-foreground">&ldquo;{card.word.exampleEn}&rdquo;</p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Mức độ ghi nhớ của bạn
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RATING_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant="outline"
              className={`h-auto flex-col gap-0.5 py-3 ${opt.className}`}
              onClick={() => handleRate(opt.value)}
            >
              <span className="font-semibold">
                {opt.label} <span className="text-xs opacity-60">({opt.key})</span>
              </span>
              <span className="text-xs font-normal text-muted-foreground">{opt.hint}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}