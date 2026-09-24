"use client";

import { Clock } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { ReviewCard } from "@/features/reviews/components/ReviewCard";
import { ReviewRatingBar } from "@/features/reviews/components/ReviewRatingBar";
import { VocabularyDetailPanel } from "@/features/vocabulary/components/VocabularyDetailPanel";
import { useReviewSession } from "@/features/reviews/hooks/useReviewSession";
import { ReviewSummary } from "@/features/reviews/components/ReviewSummary";

export default function ReviewsPage() {
  const {
    currentCard,
    isLoading,
    isEmpty,
    isFinished,
    isSubmitting,
    revealed,
    revealAnswer,
    rateCurrentCard,
    reviewedCount,
    totalDue,
    ratingCounts,
    elapsedLabel,
  } = useReviewSession();

  return (
    <PageContainer>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Ôn tập theo lịch
        </h1>
      </div>

      {isLoading && (
        <p className="py-16 text-center text-sm text-muted-foreground">Đang tải danh sách ôn tập...</p>
      )}

      {!isLoading && isEmpty && (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Bạn chưa có từ nào đến hạn ôn tập hôm nay. Hãy học thêm từ mới hoặc quay lại sau!
          </p>
        </div>
      )}

      {!isLoading && !isEmpty && isFinished && (
        <ReviewSummary
          totalCards={totalDue}
          elapsedLabel={elapsedLabel}
          ratingCounts={ratingCounts}
        />
      )}

      {!isLoading && !isEmpty && !isFinished && currentCard && (
        <>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Tiến độ ôn tập hôm nay</p>
              <p className="text-xs text-muted-foreground">
                Đã học {reviewedCount} trên tổng số {totalDue} từ cần ôn
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                <Clock className="h-3.5 w-3.5" />
                {elapsedLabel}
              </span>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {reviewedCount} / {totalDue} thẻ đến hạn
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ReviewCard card={currentCard} revealed={revealed} onReveal={revealAnswer} />
            {revealed ? (
              <VocabularyDetailPanel wordId={currentCard.word.id} />
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
                Lật thẻ để xem chi tiết từ
              </div>
            )}
          </div>

          <div className="mt-6">
            <ReviewRatingBar disabled={!revealed || isSubmitting} onRate={rateCurrentCard} />
          </div>
        </>
      )}
    </PageContainer>
  );
}