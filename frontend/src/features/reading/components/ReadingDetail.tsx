"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReadingDetailData } from "../types/reading_types";
import { DraftStatus, useReadingAttempt } from "../hooks/useReadingAttempt";
import { formatDuration } from "../utils/reading_format";
import { PassagePanel } from "./PassagePanel";
import { QuestionCard } from "./QuestionCard";
import { ResultQuestionCard } from "./ResultQuestionCard";

interface Props {
  detail: ReadingDetailData;
  restoreDraft: boolean;
  onRetry: () => void;
}

function DraftStatusLabel({ status }: { status: DraftStatus }) {
  if (status === "saving")
    return <span className="text-xs text-muted-foreground">Đang lưu nháp...</span>;
  if (status === "saved")
    return <span className="text-xs text-green-600">Đã lưu nháp</span>;
  if (status === "error")
    return <span className="text-xs text-destructive">Chưa lưu được nháp</span>;
  return null;
}

export function ReadingDetail({ detail, restoreDraft, onRetry }: Props) {
  const attempt = useReadingAttempt(detail, restoreDraft);
  const { result } = attempt;

  return (
    <div>
      <Link
        href="/reading"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Danh sách bài đọc
      </Link>

      {result ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-600 px-5 py-3 text-white">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Bài nộp thành công! Thời gian: {formatDuration(result.seconds)}
          </p>
          <p className="text-sm">
            Điểm số:
            <span className="ml-2 rounded-full bg-white px-3 py-1 font-semibold text-teal-700">
              {result.data.correctCount} / {result.data.totalQuestions} đúng
            </span>
          </p>
        </div>
      ) : (
        <>
          <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 font-medium tabular-nums text-foreground">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {formatDuration(attempt.seconds)}
              </span>
              <span className="text-muted-foreground">
                Đã trả lời {attempt.answeredCount}/{attempt.total}
              </span>
              <DraftStatusLabel status={attempt.draftStatus} />
            </div>

            <div className="flex items-center gap-3">
              {!attempt.allAnswered && (
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  Còn {attempt.total - attempt.answeredCount} câu chưa trả lời
                </span>
              )}
              <Button
                onClick={() => void attempt.submit()}
                disabled={!attempt.allAnswered || attempt.isSubmitting}
              >
                {attempt.isSubmitting ? "Đang nộp..." : "Nộp bài"}
              </Button>
            </div>
          </div>

          {attempt.submitError && (
            <p className="mt-2 text-sm text-destructive">
              Không nộp được bài, vui lòng thử lại.
            </p>
          )}
        </>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <PassagePanel title={detail.title} cefr={detail.cefr} content={detail.content} />

        {result ? (
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-heading text-base font-semibold text-foreground">
                Đáp án & Giải thích
              </h2>
              <div className="flex gap-2 text-xs font-medium">
                <span className="rounded-full bg-green-100 px-2.5 py-1 text-green-700">
                  {result.data.correctCount} đúng
                </span>
                <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700">
                  {result.data.wrongCount} sai
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {detail.questions.map((q, i) => {
                const res = result.data.results.find((r) => r.questionId === q.id);
                return (
                  <ResultQuestionCard
                    key={q.id}
                    index={i}
                    question={q}
                    selected={result.answers[q.id]}
                    correctIndex={res?.correctOptionIndex ?? -1}
                    explanation={res?.explanation ?? ""}
                  />
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={onRetry}>Làm lại</Button>
              <Link
                href="/reading"
                className="inline-flex h-9 items-center rounded-lg border border-border bg-white px-4 text-sm font-semibold text-foreground hover:bg-muted"
              >
                Về danh sách bài đọc
              </Link>
            </div>
          </section>
        ) : (
          <section className="space-y-4">
            {detail.questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                index={i}
                question={q}
                selected={attempt.answers[q.id]}
                onSelect={(optionIndex) => attempt.selectAnswer(q.id, optionIndex)}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}