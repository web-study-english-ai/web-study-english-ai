import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, HelpCircle, Play, RotateCcw, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReadingItem } from "../types/reading_types";
import { formatDuration, levelStyle } from "../utils/reading_format";

const primaryBtn =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90";
const outlineBtn =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted";

export function ReadingCard({ item }: { item: ReadingItem }) {
  const { status, answeredCount, correctCount, totalQuestions, durationSeconds } = item.progress;
  const href = `/reading/${item.id}`;
  const ratio =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  return (
    <article
      className={cn(
        "flex flex-col gap-4 border-b border-border p-4 last:border-b-0 sm:flex-row sm:items-center",
        status === "IN_PROGRESS" && "bg-rose-50/60 dark:bg-primary/10"
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
          levelStyle(item.cefr)
        )}
      >
        {item.cefr || "?"}
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-foreground">{item.title}</h3>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
          {item.description}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {item.topic && <span>{item.topic}</span>}
          {item.estimatedMinutes !== null && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {item.estimatedMinutes} phút
            </span>
          )}
          <span className="flex items-center gap-1">
            <HelpCircle className="h-3 w-3" />
            {totalQuestions} câu hỏi
          </span>
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="w-40 text-xs">
          {status === "IN_PROGRESS" && (
            <>
              <p className="flex items-center gap-1.5 font-medium text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Đang làm
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${ratio}%` }} />
                </div>
                <span className="text-muted-foreground">
                  {answeredCount}/{totalQuestions} câu
                </span>
              </div>
            </>
          )}
          {status === "COMPLETED" && (
  <>
    <p className="flex items-center gap-1.5 font-medium text-green-600">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Đã hoàn thành
    </p>
    <p className="mt-1 text-muted-foreground">
      Kết quả: {correctCount}/{totalQuestions} câu đúng
    </p>
    {durationSeconds !== null && (
      <p className="mt-0.5 flex items-center gap-1 text-muted-foreground">
        <Timer className="h-3 w-3" />
        Thời gian: {formatDuration(durationSeconds)}
      </p>
    )}
  </>
)}
          {status === "NOT_STARTED" && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
              Chưa làm
            </p>
          )}
        </div>

        {status === "IN_PROGRESS" && (
          <Link href={href} className={primaryBtn}>
            Tiếp tục <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        {status === "COMPLETED" && (
          <Link href={href} className={outlineBtn}>
            Làm lại <RotateCcw className="h-4 w-4" />
          </Link>
        )}
        {status === "NOT_STARTED" && (
          <Link href={href} className={primaryBtn}>
            Bắt đầu <Play className="h-4 w-4" />
          </Link>
        )}
      </div>
    </article>
  );
}