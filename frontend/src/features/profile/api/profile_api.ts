import { apiFetch } from "@/lib/api/client";
import { ProfileData, UpdateProfilePayload } from "../types/profile_types";
import { mapProfile } from "./profile_mapper";
import { getMockProfileRaw, mockUpdateProfile } from "./profile_mock";

const MOCK_MODE = process.env.NEXT_PUBLIC_PROFILE_MOCK;
const JSON_HEADERS = { "Content-Type": "application/json" };

export async function getProfile(): Promise<ProfileData> {
  if (MOCK_MODE) return mapProfile(await getMockProfileRaw(MOCK_MODE));

  const raw = await apiFetch<Record<string, unknown>>("/profile");
  return mapProfile(raw);
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<void> {
  if (MOCK_MODE) {
    await mockUpdateProfile(MOCK_MODE, payload);
    return;
  }

  await apiFetch<unknown>("/profile", {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}