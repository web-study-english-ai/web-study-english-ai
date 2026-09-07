"use client";

import { useState } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SRSRating, VocabularyItem } from "../types/vocabulary_types";

interface Props {
  word: VocabularyItem;
  onRate: (rating: SRSRating) => void;
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

export function LearnWordCard({ word, onRate }: Props) {
  const [flipped, setFlipped] = useState(false);

  function speak(e: React.MouseEvent) {
    e.stopPropagation();
    const utter = new SpeechSynthesisUtterance(word.word);
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
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-border bg-white p-10 text-center shadow-sm [backface-visibility:hidden]">
            <h2 className="font-heading text-4xl font-bold text-foreground">{word.word}</h2>
            <div className="mt-2 flex items-center justify-center gap-2 text-muted-foreground">
              <span>{word.ipa}</span>
              <span>({word.type})</span>
              <button onClick={speak} aria-label="Phát âm" className="text-primary">
                <Volume2 className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">Bấm vào thẻ để xem nghĩa</p>
          </div>

          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-primary/30 bg-primary/5 p-10 text-center shadow-sm [backface-visibility:hidden]"
            style={{ transform: "rotateY(180deg)" }}
          >
            <p className="text-lg font-semibold text-primary">{word.meaningVi}</p>
            <p className="mt-3 text-sm italic text-muted-foreground">&ldquo;{word.exampleEn}&rdquo;</p>
            <p className="mt-1 text-sm text-muted-foreground">{word.exampleVi}</p>
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