"use client";

import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReviewCardData } from "../types/review_types";

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

  return (
    <div className="flex h-80 flex-col items-center justify-center rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
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
          
        </div>
      ) : (
        <Button onClick={onReveal} className="mt-6 rounded-full bg-primary px-6">
          Hiện đáp án (Flip Card)
        </Button>
      )}
    </div>
  );
}