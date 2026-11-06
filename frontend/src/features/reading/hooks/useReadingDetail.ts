"use client";

import { useQuery } from "@tanstack/react-query";
import { getReadingDetail } from "../api/reading_api";

export function useReadingDetail(id: string) {
  return useQuery({
    queryKey: ["reading", "detail", id],
    queryFn: () => getReadingDetail(id),
    // Không giữ cache: mỗi lần vào bài luôn lấy bản nháp mới nhất từ BE
    gcTime: 0,
    staleTime: 0,
    retry: 1,
    // Không tự refetch khi đang làm bài
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}