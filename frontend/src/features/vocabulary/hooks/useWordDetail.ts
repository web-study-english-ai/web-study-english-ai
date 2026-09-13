"use client";

import { useQuery } from "@tanstack/react-query";
import { getWordByIdApi } from "../api/vocabulary_api";

export function useWordDetail(wordId: string | null) {
  return useQuery({
    queryKey: ["word", wordId],
    queryFn: () => getWordByIdApi(wordId!),
    enabled: Boolean(wordId),
    staleTime: 10 * 60 * 1000,
  });
}