"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { addCardsApi, listCardsApi, removeCardApi } from "../api/cards_api";
import { DeckCard } from "../types/vocabulary_types";

interface CanhBaoHanMuc {
  wordId: string;
  message: string;
}

export function useVocabularyDeck() {
  const queryClient = useQueryClient();
  const [canhBaoHanMuc, setCanhBaoHanMuc] = useState<CanhBaoHanMuc | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cards"],
    queryFn: () => listCardsApi(),
    staleTime: 60 * 1000,
  });

  const deck: DeckCard[] = data?.items ?? [];
  const wordIdsTrongBoThe = new Set(deck.map((c) => c.word.id));

  const lamMoiBoThe = () => queryClient.invalidateQueries({ queryKey: ["cards"] });

  const themMutation = useMutation({
    mutationFn: ({ wordId, force }: { wordId: string; force: boolean }) =>
      addCardsApi([wordId], force),
    onSuccess: lamMoiBoThe,
  });

  const xoaMutation = useMutation({
    mutationFn: (cardId: string) => removeCardApi(cardId),
    onSuccess: lamMoiBoThe,
  });

  async function themTu(wordId: string) {
    try {
      await themMutation.mutateAsync({ wordId, force: false });
    } catch (err) {
      // 409 = vượt hạn mức từ mới trong ngày, hỏi lại người dùng thay vì báo lỗi
      if (err instanceof ApiError && err.status === 409) {
        setCanhBaoHanMuc({ wordId, message: err.message });
        return;
      }
      throw err;
    }
  }

  async function themDuVuotHanMuc() {
    if (!canhBaoHanMuc) return;
    await themMutation.mutateAsync({ wordId: canhBaoHanMuc.wordId, force: true });
    setCanhBaoHanMuc(null);
  }

  return {
    deck,
    isLoading,
    isError,
    isInDeck: (wordId: string) => wordIdsTrongBoThe.has(wordId),
    themTu,
    xoaThe: (cardId: string) => xoaMutation.mutateAsync(cardId),
    canhBaoHanMuc,
    themDuVuotHanMuc,
    boQuaCanhBao: () => setCanhBaoHanMuc(null),
  };
}