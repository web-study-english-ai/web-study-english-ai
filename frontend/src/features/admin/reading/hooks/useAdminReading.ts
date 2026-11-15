"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminRetry } from "@/features/admin/shared/lib/admin_errors";
import {
  deleteAdminReading,
  getAdminReadings,
  getReadingTopics,
  updateAdminReading,
} from "../api/reading_admin_api";
import { AdminReadingListParams, UpdateReadingBody } from "../types/reading_admin_types";

export function useAdminReadings(params: AdminReadingListParams) {
  return useQuery({
    queryKey: ["admin", "reading", params],
    queryFn: () => getAdminReadings(params),
    placeholderData: keepPreviousData,
    retry: adminRetry,
  });
}

export function useReadingTopics() {
  return useQuery({
    queryKey: ["admin", "reading-topics"],
    queryFn: getReadingTopics,
    staleTime: 5 * 60_000,
    retry: adminRetry,
  });
}

export function useUpdateReading() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateReadingBody }) =>
      updateAdminReading(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "reading"] }),
  });
}

export function useDeleteReading() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAdminReading(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "reading"] }),
  });
}