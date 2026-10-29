"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveReadingDraft, submitReading } from "../api/reading_api";
import { AttemptPayload, ReadingDetailData, SubmitResult } from "../types/reading_types";

export type DraftStatus = "idle" | "saving" | "saved" | "error";

export interface AttemptResult {
  data: SubmitResult;
  answers: Record<string, number>;
  seconds: number;
}

const DRAFT_DEBOUNCE_MS = 1200;

function buildPayload(
  answers: Record<string, number>,
  durationSeconds: number
): AttemptPayload {
  return {
    durationSeconds,
    answers: Object.entries(answers).map(([questionId, selectedOptionIndex]) => ({
      questionId,
      selectedOptionIndex,
    })),
  };
}

export function useReadingAttempt(detail: ReadingDetailData, restoreDraft: boolean) {
  const queryClient = useQueryClient();
  const detailId = detail.id;
  const initialDraft = restoreDraft ? detail.draft : null;

  const [answers, setAnswers] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      (initialDraft?.answers ?? []).map((a) => [a.questionId, a.selectedOptionIndex])
    )
  );
  const [seconds, setSeconds] = useState(initialDraft?.durationSeconds ?? 0);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("idle");
  const [result, setResult] = useState<AttemptResult | null>(null);

  const answersRef = useRef(answers);
  const secondsRef = useRef(seconds);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<Promise<void> | null>(null);

  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  // Đồng hồ chỉ chạy khi tab đang hiển thị và chưa nộp bài
  useEffect(() => {
    if (result) return;
    const timer = setInterval(() => {
      if (!document.hidden) setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [result]);

  // Rời trang khi còn nháp chưa kịp lưu thì lưu nốt
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void saveReadingDraft(
          detailId,
          buildPayload(answersRef.current, secondsRef.current)
        ).catch(() => {});
      }
    };
  }, [detailId]);

  function selectAnswer(questionId: string, optionIndex: number) {
    if (result) return;

    const next = { ...answersRef.current, [questionId]: optionIndex };
    answersRef.current = next;
    setAnswers(next);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      setDraftStatus("saving");
      pendingSave.current = saveReadingDraft(
        detailId,
        buildPayload(answersRef.current, secondsRef.current)
      )
        .then(() => setDraftStatus("saved"))
        .catch(() => setDraftStatus("error"));
    }, DRAFT_DEBOUNCE_MS);
  }

  const submitMutation = useMutation({
    mutationFn: (payload: AttemptPayload) => submitReading(detailId, payload),
    onSuccess: (data, payload) => {
      setResult({
        data,
        answers: { ...answersRef.current },
        seconds: payload.durationSeconds,
      });
      void queryClient.invalidateQueries({ queryKey: ["reading", "list"] });
    },
  });

  async function submit() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    // Chờ lần lưu nháp đang chạy xong để không đè lên bài đã nộp
    await pendingSave.current;
    submitMutation.mutate(buildPayload(answersRef.current, secondsRef.current));
  }

  const total = detail.questions.length;
  const answeredCount = detail.questions.filter((q) => answers[q.id] !== undefined).length;

  return {
    answers,
    selectAnswer,
    seconds,
    total,
    answeredCount,
    allAnswered: total > 0 && answeredCount >= total,
    draftStatus,
    submit,
    isSubmitting: submitMutation.isPending,
    submitError: submitMutation.isError,
    result,
  };
}