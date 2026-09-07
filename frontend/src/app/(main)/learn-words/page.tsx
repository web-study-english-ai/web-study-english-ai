"use client";

import { useEffect } from "react";
import { PageContainer } from "@/components/shared/PageContainer";
import { LearnWordCard } from "@/features/vocabulary/components/LearnWordCard";
import { useLearnNewWords } from "@/features/vocabulary/hooks/useLearnNewWords";
import { SRSRating } from "@/features/vocabulary/types/vocabulary_types";

const KEY_TO_RATING: Record<string, SRSRating> = {
  "1": "forgot",
  "2": "hard",
  "3": "medium",
  "4": "easy",
};

export default function LearnWordsPage() {
  const { currentWord, total, learnedCount, isLoading, isFinished, rateCurrentWord } =
    useLearnNewWords();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const rating = KEY_TO_RATING[e.key];
      if (rating && currentWord && !isFinished) {
        rateCurrentWord(rating);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentWord, isFinished, rateCurrentWord]);

  return (
    <PageContainer>
      <div className="mx-auto max-w-xl">
        {isLoading && (
          <p className="py-16 text-center text-sm text-muted-foreground">Đang tải từ mới...</p>
        )}

        {!isLoading && isFinished && (
          <div className="rounded-2xl border border-border bg-white p-10 text-center">
            <h2 className="font-heading text-xl font-semibold text-foreground">
              🎉 Bạn đã học xong {total} từ mới hôm nay!
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Quay lại &quot;Ôn tập theo lịch&quot; để củng cố những từ vừa học.
            </p>
          </div>
        )}

        {!isLoading && !isFinished && currentWord && (
          <>
            <div className="mb-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tiến trình học</span>
                <span className="font-semibold text-primary">
                  {learnedCount} / {total} từ mới
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(learnedCount / total) * 100}%` }}
                />
              </div>
            </div>

            <LearnWordCard key={currentWord.id} word={currentWord} onRate={rateCurrentWord} />

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Mẹo: dùng phím <kbd className="rounded bg-muted px-1.5 py-0.5">1</kbd>–
              <kbd className="rounded bg-muted px-1.5 py-0.5">4</kbd> để đánh giá nhanh
            </p>
          </>
        )}
      </div>
    </PageContainer>
  );
}