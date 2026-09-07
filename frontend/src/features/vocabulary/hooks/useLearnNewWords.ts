"use client";

import { useEffect, useRef, useState } from "react";
import { getNewWordsBatchMock, saveWordProgressMock } from "../api/vocabulary_mock";
import { SRSRating, VocabularyItem, WordProgressRecord } from "../types/vocabulary_types";

const PROGRESS_KEY = "learn_words_progress";
const IDLE_THRESHOLD_MS = 60_000;
const MAX_RESPONSE_TIME_MS = 120_000;

function persistProgress(record: WordProgressRecord) {
  const raw = localStorage.getItem(PROGRESS_KEY);
  const list: WordProgressRecord[] = raw ? JSON.parse(raw) : [];
  const filtered = list.filter((r) => r.wordId !== record.wordId);
  localStorage.setItem(PROGRESS_KEY, JSON.stringify([...filtered, record]));
}

export function useLearnNewWords() {
  const [words, setWords] = useState<VocabularyItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  const [isAway, setIsAway] = useState(false); // true = đang hiện popup "Chào mừng quay lại"

  const startTimeRef = useRef<number>(0);
  const hiddenAccumMs = useRef<number>(0);
  const hiddenSinceRef = useRef<number | null>(null);
  const wasIdleRef = useRef<boolean>(false);

  useEffect(() => {
    getNewWordsBatchMock(20).then((data) => {
      setWords(data);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!isLoading && words.length > 0) {
      startTimeRef.current = Date.now();
      hiddenAccumMs.current = 0;
      hiddenSinceRef.current = null;
      wasIdleRef.current = false;
      setIsAway(false);
    }
  }, [currentIndex, isLoading, words.length]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
      } else if (hiddenSinceRef.current) {
        const hiddenDuration = Date.now() - hiddenSinceRef.current;
        hiddenSinceRef.current = null;

        if (hiddenDuration > IDLE_THRESHOLD_MS) {
          // Rời quá lâu — chặn lại, chờ xác nhận, KHÔNG cộng dồn thời gian ẩn vào bộ đếm
          wasIdleRef.current = true;
          setIsAway(true);
        } else {
          // Rời ngắn — chấp nhận, chỉ trừ ra khỏi thời gian phản hồi
          hiddenAccumMs.current += hiddenDuration;
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Người dùng bấm "Tiếp tục" trên popup — reset đồng hồ cho công bằng, không tính thời gian đã rời đi
  function confirmReturn() {
    startTimeRef.current = Date.now();
    hiddenAccumMs.current = 0;
    setIsAway(false);
  }

  const currentWord = words[currentIndex] ?? null;
  const total = words.length;
  const learnedCount = currentIndex;

  async function rateCurrentWord(rating: SRSRating) {
    if (!currentWord || isAway) return; // chặn đánh giá khi popup đang mở

    const rawElapsed = Date.now() - startTimeRef.current - hiddenAccumMs.current;
    const responseTimeMs = Math.min(Math.max(rawElapsed, 0), MAX_RESPONSE_TIME_MS);
    const isIdle = wasIdleRef.current;

    const record = await saveWordProgressMock(currentWord.id, rating, responseTimeMs, isIdle);
    persistProgress(record);

    if (currentIndex + 1 >= total) {
      setIsFinished(true);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  return {
    currentWord,
    total,
    learnedCount,
    isLoading,
    isFinished,
    isAway,
    confirmReturn,
    rateCurrentWord,
  };
}