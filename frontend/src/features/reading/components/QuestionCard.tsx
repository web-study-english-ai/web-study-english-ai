"use client";

import { cn } from "@/lib/utils";
import { ReadingQuestion } from "../types/reading_types";
import { optionLetter } from "../utils/reading_format";

interface Props {
  index: number;
  question: ReadingQuestion;
  selected: number | undefined;
  onSelect: (optionIndex: number) => void;
}

export function QuestionCard({ index, question, selected, onSelect }: Props) {
  // Câu True/False chỉ có 2 đáp án thì không cần nhãn A/B
  const showLetter = question.options.length > 2;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm font-semibold text-foreground">
        Q{index + 1}. {question.questionText}
      </p>

      <div role="radiogroup" aria-label={`Câu ${index + 1}`} className="mt-3 space-y-2">
        {question.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={selected === i}
            onClick={() => onSelect(i)}
            className={cn(
              "flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
              selected === i
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            {showLetter && <span className="font-semibold">{optionLetter(i)}.</span>}
            <span>{opt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}