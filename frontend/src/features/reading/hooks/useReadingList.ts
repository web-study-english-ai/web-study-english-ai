"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getReadingList } from "../api/reading_api";
import { ReadingListParams } from "../types/reading_types";

export function useReadingList(params: ReadingListParams) {
  return useQuery({
    queryKey: ["reading", "list", params],
    queryFn: () => getReadingList(params),
    placeholderData: keepPreviousData,
    staleTime: 0, // quay lại từ trang làm bài là thấy tiến độ mới
  });
}