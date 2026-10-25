"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getProgressStats } from "../api/progress_api";
import { ProgressRange } from "../types/progress_types";

export function useProgressStats(range: ProgressRange) {
  return useQuery({
    queryKey: ["progress", "stats", range],
    queryFn: () => getProgressStats(range),
    staleTime: 60_000,
    // Giữ dữ liệu cũ trên màn hình trong lúc tải chế độ mới,
    // nhờ đó chỉ biểu đồ bị mờ chứ cả trang không nháy về skeleton
    placeholderData: keepPreviousData,
  });
}