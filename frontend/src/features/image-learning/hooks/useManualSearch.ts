"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchWords } from "../api/image-learning_api";

export function useManualSearch() {
  const [term, setTerm] = useState("");

  const query = useQuery({
    queryKey: ["vision", "manual-search", term],
    queryFn: () => searchWords(term),
    enabled: term.length > 0,
    staleTime: 60_000,
    retry: 1,
  });

  return {
    term,
    search: (value: string) => setTerm(value.trim()),
    results: query.data ?? [],
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: query.refetch,
  };
}