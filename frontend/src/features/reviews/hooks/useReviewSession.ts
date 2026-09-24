"use client";

import { useEffect, useRef, useState } from "react";
import { listDueCardsApi } from "@/features/vocabulary/api/cards_api";
import { RATING_VALUE, SRSRating } from "@/features/vocabulary/types/vocabulary_types";
import { createReviewApi } from "../api/reviews_api";
import { ReviewCardData } from "../types/review_types";

// Số thẻ tối đa cho mỗi phiên ôn tập
const MAX_CARDS_PER_SESSION = 20;

const EMPTY_COUNTS: Record<SRSRating, number> = {
  forgot: 0,
  hard: 0,
  medium: 0,
  easy: 0,
};

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

export function useReviewSession() {
  const [queue, setQueue] = useState<ReviewCardData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [totalDue, setTotalDue] = useState(0);
  // Số thẻ đã ôn xong (không tính thẻ "Chưa nhớ" đang phải ôn lại)
  const [completedCount, setCompletedCount] = useState(0);
  const [ratingCounts, setRatingCounts] = useState<Record<SRSRating, number>>(EMPTY_COUNTS);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Thời điểm thẻ hiện tại bắt đầu hiển thị, dùng để tính durationMs
  const cardStartRef = useRef<number>(0);

  const currentCard = queue[currentIndex] ?? null;
  const isFinished = !isLoading && queue.length > 0 && currentIndex >= queue.length;
  const isEmpty = !isLoading && queue.length === 0;
  const isRunning = !isLoading && queue.length > 0 && !isFinished;

  // Tải các thẻ đến hạn từ backend
  useEffect(() => {
    let cancelled = false;

    listDueCardsApi()
      .then((cards) => {
        if (cancelled) return;
        const list: ReviewCardData[] = cards
          .slice(0, MAX_CARDS_PER_SESSION)
          .map((c) => ({ cardId: c.id, word: c.word }));
        setQueue(list);
        setTotalDue(list.length);
      })
      .catch((err) => {
        console.error("Không tải được danh sách thẻ đến hạn", err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Đồng hồ chỉ chạy trong lúc đang ôn, dừng khi xong phiên
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  // Mỗi khi sang thẻ mới thì bắt đầu đếm lại thời gian trả lời
  useEffect(() => {
    cardStartRef.current = Date.now();
  }, [currentIndex, isLoading]);

  function revealAnswer() {
    setRevealed(true);
  }

  async function rateCurrentCard(rating: SRSRating) {
    if (!currentCard || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createReviewApi({
        cardId: currentCard.cardId,
        rating: RATING_VALUE[rating],
        durationMs: Date.now() - cardStartRef.current,
      });

      setRatingCounts((c) => ({ ...c, [rating]: c[rating] + 1 }));

      if (rating === "forgot") {
        // "Chưa nhớ": đưa thẻ xuống cuối hàng chờ để ôn lại trong phiên này
        setQueue((q) => [...q, currentCard]);
      } else {
        setCompletedCount((n) => n + 1);
      }

      setRevealed(false);
      setCurrentIndex((i) => i + 1);
    } catch (err) {
      // Gửi lỗi thì giữ nguyên thẻ hiện tại để người dùng bấm lại
      console.error("Không gửi được đánh giá", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    currentCard,
    isLoading,
    isEmpty,
    isFinished,
    isSubmitting,
    revealed,
    revealAnswer,
    rateCurrentCard,
    reviewedCount: completedCount,
    totalDue,
    ratingCounts,
    elapsedLabel: formatElapsed(elapsedSeconds),
  };
}