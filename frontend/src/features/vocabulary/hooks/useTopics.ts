"use client";

import { useQuery } from "@tanstack/react-query";
import { listTopicsApi } from "../api/vocabulary_api";

export function useTopics() {
  const { data } = useQuery({
    queryKey: ["topics"],
    queryFn: listTopicsApi,
    staleTime: 60 * 60 * 1000,
  });

  return data ?? [];
}