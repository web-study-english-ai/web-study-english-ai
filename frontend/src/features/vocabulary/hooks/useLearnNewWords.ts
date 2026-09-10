"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listNewCardsApi } from "../api/cards_api";
import { createReviewApi } from "@/features/reviews/api/reviews_api";
import { DeckCard, RATING_VALUE, SRSRating } from "../types/vocabulary_types";

const IDLE_THRESHOLD_MS = 60_000;
const MAX_RESPONSE_TIME_MS = 120_000;

export function useLearnNewWords() {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [isAway, setIsAway] = useState(false);

  const startTimeRef = useRef<number>(0);
  const hiddenAccumMs = useRef<number>(0);
  const hiddenSinceRef = useRef<number | null>(null);

    const { data, isLoading } = useQuery({
    queryKey: ["cards", "new"],
    queryFn: () => listNewCardsApi(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,   // mạng chập chờn cũng không được nạp lại giữa buổi
  });

  const cards: DeckCard[] = data?.items ?? [];
  const currentCard = cards[currentIndex] ?? null;
  const total = cards.length;
  const learnedCount = currentIndex;

    const guiMutation = useMutation({
    mutationFn: createReviewApi,
    // exact: true để KHÔNG đụng vào ["cards","new"] đang dùng dở.
    // Thiếu nó thì danh sách bị nạp lại giữa buổi và lệch với currentIndex.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards"], exact: true }),
  });

  // Bắt đầu bấm giờ lại mỗi khi sang thẻ mới
  useEffect(() => {
    if (!isLoading && total > 0) {
      startTimeRef.current = Date.now();
      hiddenAccumMs.current = 0;
      hiddenSinceRef.current = null;
    }
  }, [currentIndex, isLoading, total]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
      } else if (hiddenSinceRef.current) {
        const hiddenDuration = Date.now() - hiddenSinceRef.current;
        hiddenSinceRef.current = null;

        if (hiddenDuration > IDLE_THRESHOLD_MS) {
          // Rời quá lâu — chặn lại chờ xác nhận, không cộng dồn vào bộ đếm
          setIsAway(true);
        } else {
          // Rời ngắn — chỉ trừ ra khỏi thời gian phản hồi
          hiddenAccumMs.current += hiddenDuration;
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  function confirmReturn() {
    startTimeRef.current = Date.now();
    hiddenAccumMs.current = 0;
    setIsAway(false);
  }

  async function rateCurrentWord(rating: SRSRating) {
    if (!currentCard || isAway || guiMutation.isPending) return;

    const rawElapsed = Date.now() - startTimeRef.current - hiddenAccumMs.current;
    const durationMs = Math.min(Math.max(rawElapsed, 0), MAX_RESPONSE_TIME_MS);

    await guiMutation.mutateAsync({
      cardId: currentCard.id,
      rating: RATING_VALUE[rating],
      durationMs,
    });

    if (currentIndex + 1 >= total) {
      setIsFinished(true);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  return {
    currentCard,
    total,
    learnedCount,
    isLoading,
    isFinished,
    isAway,
    isSubmitting: guiMutation.isPending,
    confirmReturn,
    rateCurrentWord,
  };
}