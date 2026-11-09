"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { updateProfile } from "../api/profile_api";
import { ProfileData, UpdateProfilePayload } from "../types/profile_types";

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { updateUser } = useAuth();

  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => updateProfile(payload),
    onSuccess: (data, payload) => {
      queryClient.setQueryData<ProfileData>(["profile"], (old) =>
        old
          ? {
            ...old,
            name: payload.name,
            phone: payload.phone,
            address: payload.address,
            birthDate: payload.birthDate,
            avatarUrl: data.avatarUrl ?? old.avatarUrl,
          }
          : old
      );
      updateUser({
        name: payload.name,
        ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
      });
    },
  });
}