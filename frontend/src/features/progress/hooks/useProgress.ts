"use client";

import { useQuery } from "@tanstack/react-query";
import { getProgressStats } from "../api/progress_api";

export function useProgressStats() {
  return useQuery({
    queryKey: ["progress", "stats"],
    queryFn: getProgressStats,
    staleTime: 60_000,
  });
}