"use client";

import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { searchWordsApi } from "../api/vocabulary_api";
import { VocabularyFilters, VocabularyItem } from "../types/vocabulary_types";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

export function useVocabularySearch() {
  const [filters, setFiltersRaw] = useState<VocabularyFilters>({
    query: "",
    topicId: "all",
    level: "all",
  });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<VocabularyItem | null>(null);

  const debouncedFilters = useDebouncedValue(filters, 300);

  // Đổi bộ lọc thì luôn quay về trang 1, tránh kẹt ở trang trống
  function setFilters(update: VocabularyFilters | ((prev: VocabularyFilters) => VocabularyFilters)) {
    setFiltersRaw(update);
    setPage(1);
  }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["vocabulary", debouncedFilters, page],
    queryFn: () => searchWordsApi(debouncedFilters, page),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  const results = data?.items ?? [];
  const effectiveSelected = selected ?? results[0] ?? null;

  return {
    filters,
    setFilters,
    page,
    setPage,
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