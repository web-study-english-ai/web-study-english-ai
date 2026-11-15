"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminRetry } from "@/features/admin/shared/lib/admin_errors";
import {
  deleteAdminWord,
  getAdminWords,
  getWordTopics,
  updateAdminWord,
} from "../api/words_api";
import { UpdateWordBody, WordListParams } from "../types/words_types";

export function useAdminWords(params: WordListParams) {
  return useQuery({
    queryKey: ["admin", "words", params],
    queryFn: () => getAdminWords(params),
    placeholderData: keepPreviousData,
    retry: adminRetry,
  });
}

export function useWordTopics() {
  return useQuery({
    queryKey: ["admin", "word-topics"],
    queryFn: getWordTopics,
    staleTime: 5 * 60_000,
    retry: adminRetry,
  });
}

export function useUpdateWord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateWordBody }) =>
      updateAdminWord(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "words"] }),
  });
}

export function useDeleteWord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAdminWord(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "words"] }),
  });
}