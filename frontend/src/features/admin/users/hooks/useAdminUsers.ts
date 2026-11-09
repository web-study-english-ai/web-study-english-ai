"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminRetry } from "@/features/admin/shared/lib/admin_errors";
import { getAdminUsers, updateAdminUser } from "../api/users_api";
import { UpdateUserBody, UserListParams } from "../types/users_types";

export function useAdminUsers(params: UserListParams) {
  return useQuery({
    queryKey: ["admin", "users", params],
    queryFn: () => getAdminUsers(params),
    placeholderData: keepPreviousData,
    retry: adminRetry,
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserBody }) =>
      updateAdminUser(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}