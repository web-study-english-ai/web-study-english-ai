import { apiFetch } from "@/lib/api/client";
import {
  ProfileData,
  UpdateProfilePayload,
  UpdateProfileResult,
} from "../types/profile_types";
import { mapProfile } from "./profile_mapper";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function getProfile(): Promise<ProfileData> {
  const raw = await apiFetch<Record<string, unknown>>("/users/me");
  return mapProfile(raw);
}

async function uploadAvatar(file: File): Promise<string | null> {
  const form = new FormData();
  form.append("file", file); // tên field: "file"
  const raw = await apiFetch<Record<string, unknown>>("/users/me/avatar", {
    method: "POST",
    body: form,
  });
  const url = raw.avatarUrl ?? raw.url;
  return typeof url === "string" ? url : null;
}

export async function updateProfile(
  payload: UpdateProfilePayload
): Promise<UpdateProfileResult> {
  // Upload ảnh trước, lỗi ảnh thì dừng luôn để người dùng thử lại
  const avatarUrl = payload.avatarFile ? await uploadAvatar(payload.avatarFile) : null;

  await apiFetch<unknown>("/users/me", {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      fullName: payload.name,
      phone: payload.phone || null,
      address: payload.address || null,
      dateOfBirth: payload.birthDate || null,
      ...(payload.newPassword
        ? { currentPassword: payload.currentPassword, newPassword: payload.newPassword }
        : {}),
    }),
  });

  return { avatarUrl };
}