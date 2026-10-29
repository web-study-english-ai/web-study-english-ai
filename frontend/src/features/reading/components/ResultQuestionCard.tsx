import { CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReadingQuestion } from "../types/reading_types";
import { optionLetter } from "../utils/reading_format";

interface Props {
  index: number;
  question: ReadingQuestion;
  selected: number | undefined;
  correctIndex: number;
  explanation: string;
}

export function ResultQuestionCard({
  index,
  question,
  selected,
  correctIndex,
  explanation,
}: Props) {
  const isCorrect = selected === correctIndex;
  const showLetter = question.options.length > 2;

  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">
          Q{index + 1}. {question.questionText}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            isCorrect ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          )}
        >
          {isCorrect ? "Đúng" : "Sai"}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {question.options.map((opt, i) => {
          const isRight = i === correctIndex;
          const isWrongPick = i === selected && !isRight;

          return (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
                isRight && "border-green-300 bg-green-50 font-medium text-green-800",
                isWrongPick && "border-red-300 bg-red-50 font-medium text-red-800",
                !isRight && !isWrongPick && "border-transparent bg-muted/50 text-muted-foreground"
              )}
            >
              {isRight && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
              {isWrongPick && <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>
                {showLetter && `${optionLetter(i)}. `}
                {opt}
                {isWrongPick && " (Câu trả lời của bạn)"}
                {isRight && !isCorrect && " (Đáp án đúng)"}
              </span>
            </div>
          );
        })}
      </div>

      {explanation && (
        <div
          className={cn(
            "mt-3 flex items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed",
            isCorrect
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          )}
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>Giải thích: {explanation}</p>
        </div>
      )}
    </div>
  );
}