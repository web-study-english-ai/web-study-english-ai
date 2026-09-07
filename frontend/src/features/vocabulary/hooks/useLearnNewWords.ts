"use client";

import { useEffect, useState } from "react";
import { getNewWordsBatchMock, saveWordProgressMock } from "../api/vocabulary_mock";
import { SRSRating, VocabularyItem, WordProgressRecord } from "../types/vocabulary_types";

const PROGRESS_KEY = "learn_words_progress";

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

  useEffect(() => {
    getNewWordsBatchMock(20).then((data) => {
      setWords(data);
      setIsLoading(false);
    });
  }, []);

  const currentWord = words[currentIndex] ?? null;
  const total = words.length;
  const learnedCount = currentIndex;

  async function rateCurrentWord(rating: SRSRating) {
    if (!currentWord) return;
    const record = await saveWordProgressMock(currentWord.id, rating);
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
    rateCurrentWord,
  };
}