"use client";

import { useEffect } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReviewCardData } from "../types/review_types";
import { CardImage } from "@/components/shared/CardImage";

interface Props {
  card: ReviewCardData;
  revealed: boolean;
  onReveal: () => void;
}

export function ReviewCard({ card, revealed, onReveal }: Props) {
  function speak() {
    const utter = new SpeechSynthesisUtterance(card.word.term);
    utter.lang = "en-US";
    window.speechSynthesis.speak(utter);
  }

  // Space / Enter để hiện đáp án (chỉ khi thẻ chưa lật)
  useEffect(() => {
    if (revealed) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== " " && e.key !== "Enter") return;
      if (e.repeat) return; // giữ phím không được kích hoạt lặp lại
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

      // Không bắt phím khi đang gõ hoặc đang focus vào link
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.tagName === "A" ||
          el.isContentEditable)
      )
        return;

      e.preventDefault(); // tránh Space làm cuộn trang / Enter bấm nút lần hai
      onReveal();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [revealed, onReveal]);

  return (
    <div className="flex h-80 flex-col items-center justify-center rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <Badge variant="secondary" className="mb-4 text-xs">
        Từ vựng hôm nay
      </Badge>

      <h2 className="font-heading text-4xl font-bold text-foreground">{card.word.term}</h2>
      <div className="mt-2 flex items-center justify-center gap-2 text-muted-foreground">
        <span>{card.word.ipa}</span>
        <button onClick={speak} aria-label="Phát âm" className="text-primary">
          <Volume2 className="h-4 w-4" />
        </button>
      </div>

      {revealed ? (
        <div className="mt-5 border-t border-border pt-5">
          <p className="font-semibold text-primary">{card.word.meaningVi}</p>
          <CardImage
            src={card.imageUrl}
            alt={`Ảnh bạn đã chụp: ${card.word.term}`}
            className="mt-3 max-h-24"
          />
        </div>
      ) : (
        <>
          <Button onClick={onReveal} className="mt-6 rounded-full bg-primary px-6">
            Hiện đáp án
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            hoặc nhấn{" "}
            <kbd className="rounded bg-muted px-1.5 py-0.5">Space</kbd> /{" "}
            <kbd className="rounded bg-muted px-1.5 py-0.5">Enter</kbd>
          </p>
        </>
      )}
    </div>
  );
}