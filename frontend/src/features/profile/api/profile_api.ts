import { apiFetch } from "@/lib/api/client";
import { ProfileData, UpdateProfilePayload } from "../types/profile_types";
import { mapProfile } from "./profile_mapper";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function getProfile(): Promise<ProfileData> {
  const raw = await apiFetch<Record<string, unknown>>("/users/me");
  return mapProfile(raw);
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<void> {
  await apiFetch<unknown>("/users/me", {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      fullName: payload.name,
      ...(payload.newPassword ? { newPassword: payload.newPassword } : {}),
    }),
  });
}