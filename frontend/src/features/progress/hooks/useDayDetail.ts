"use client";

import { useQuery } from "@tanstack/react-query";
import { getDayDetail } from "../api/progress_api";

export function useDayDetail(date: string) {
  return useQuery({
    queryKey: ["progress", "day", date],
    queryFn: () => getDayDetail(date),
    enabled: Boolean(date),
    staleTime: 60_000,
  });
}