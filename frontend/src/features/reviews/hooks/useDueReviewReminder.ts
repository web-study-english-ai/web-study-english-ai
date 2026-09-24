"use client";

import { useEffect, useState } from "react";
import { listDueCardsApi } from "@/features/vocabulary/api/cards_api";

export function useDueReviewReminder() {
  const [dueCount, setDueCount] = useState<number | null>(null); // null = đang tải
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    listDueCardsApi()
      .then((cards) => {
        if (!cancelled) setDueCount(cards.length);
      })
      .catch((err) => {
        console.error("Không tải được số thẻ đến hạn", err);
        // Lỗi thì coi như không có thẻ để không kẹt mãi ở trạng thái đang tải
        if (!cancelled) setDueCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isLoading = dueCount === null;
  const hasNoDue = dueCount === 0;
  const shouldShow = !isLoading && !hasNoDue && !dismissed;

  function dismiss() {
    setDismissed(true);
  }

  return { dueCount, isLoading, hasNoDue, shouldShow, dismiss };
}