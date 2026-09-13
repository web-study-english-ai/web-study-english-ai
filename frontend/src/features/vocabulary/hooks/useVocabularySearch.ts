"use client";

import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { searchWordsApi } from "../api/vocabulary_api";
import { VocabularyFilters, VocabularyItem } from "../types/vocabulary_types";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

export function useVocabularySearch() {
  const [filters, setFilters] = useState<VocabularyFilters>({
    query: "",
    topicId: "all",
    level: "all",
  });
  const [selected, setSelected] = useState<VocabularyItem | null>(null);

  const debouncedFilters = useDebouncedValue(filters, 300);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["vocabulary", debouncedFilters],
    queryFn: () => searchWordsApi(debouncedFilters),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  const results = data?.items ?? [];
  const effectiveSelected = selected ?? results[0] ?? null;

  return {
    filters,
    setFilters,
    results,
    meta: data?.meta,
    selected: effectiveSelected,
    setSelected,
    isLoading,
    isError,
    error,
    refetch,
  };
}