"use client";

import { useEffect, useRef, useState } from "react";
import { listDueCardsApi } from "@/features/vocabulary/api/cards_api";
import { RATING_VALUE, SRSRating } from "@/features/vocabulary/types/vocabulary_types";
import { createReviewApi, CreateReviewPayload } from "../api/reviews_api";
import { ReviewCardData } from "../types/review_types";
import { enqueuePending, isNetworkError, useOfflineReviewSync } from "@/lib/hooks/offlineReviewQueue";

// Số thẻ tối đa cho mỗi phiên ôn tập
const MAX_CARDS_PER_SESSION = 20;
// Thẻ "Chưa nhớ" phải cách ít nhất 5 thẻ khác mới được hỏi lại trong cùng phiên
const MIN_REQUEUE_GAP = 5;

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

// Chèn thẻ trở lại hàng chờ, cách vị trí hiện tại ít nhất MIN_REQUEUE_GAP thẻ
function requeueWithGap(
  queue: ReviewCardData[],
  fromIndex: number,
  card: ReviewCardData,
): ReviewCardData[] {
  const insertAt = Math.min(fromIndex + 1 + MIN_REQUEUE_GAP, queue.length);
  const next = [...queue];
  next.splice(insertAt, 0, card);
  return next;
}

export function useReviewSession() {
  const [queue, setQueue] = useState<ReviewCardData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [totalDue, setTotalDue] = useState(0);
  // Số thẻ đã ôn xong hẳn (state trả về là REVIEW, không còn LEARNING/RELEARNING)
  const [completedCount, setCompletedCount] = useState(0);
  const [ratingCounts, setRatingCounts] = useState<Record<SRSRating, number>>(EMPTY_COUNTS);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Thời điểm thẻ hiện tại bắt đầu hiển thị, dùng để tính durationMs
  const cardStartRef = useRef<number>(0);

  // Tự đồng bộ hàng chờ offline (dùng chung với "Học từ mới") khi mount và khi có mạng lại
  const pendingSyncCount = useOfflineReviewSync();

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

    const card = currentCard;
    const myIndex = currentIndex;
    const payload: CreateReviewPayload = {
      cardId: card.cardId,
      rating: RATING_VALUE[rating],
      durationMs: Date.now() - cardStartRef.current,
      // Thời điểm người học thật sự bấm đánh giá, không phải lúc gửi lên server
      reviewedAt: new Date().toISOString(),
    };

    setIsSubmitting(true);
    setRatingCounts((c) => ({ ...c, [rating]: c[rating] + 1 }));

    try {
      // Không có mạng: lưu tạm luôn, không chờ fetch thất bại mới biết
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        enqueuePending(payload);
        if (rating === "forgot") {
          setQueue((q) => requeueWithGap(q, myIndex, card));
        } else {
          setCompletedCount((n) => n + 1);
        }
        setRevealed(false);
        setCurrentIndex((i) => i + 1);
        return;
      }

      const result = await createReviewApi(payload);
      const stillLearning = result.card.state === "LEARNING" || result.card.state === "RELEARNING";
      if (stillLearning) {
        setQueue((q) => requeueWithGap(q, myIndex, card));
      } else {
        setCompletedCount((n) => n + 1);
      }

      setRevealed(false);
      setCurrentIndex((i) => i + 1);
    } catch (err) {
      if (isNetworkError(err)) {
        // Mất mạng giữa chừng: lưu tạm để đồng bộ sau, không chặn người học
        enqueuePending(payload);
        if (rating === "forgot") {
          setQueue((q) => requeueWithGap(q, myIndex, card));
        } else {
          setCompletedCount((n) => n + 1);
        }
        setRevealed(false);
        setCurrentIndex((i) => i + 1);
      } else {
        // Lỗi khác (không phải do mất mạng): giữ nguyên thẻ để người dùng bấm lại
        console.error("Không gửi được đánh giá", err);
      }
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
    pendingSyncCount,
    elapsedLabel: formatElapsed(elapsedSeconds),
  };
}