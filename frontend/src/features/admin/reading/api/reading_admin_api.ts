import { apiFetch } from "@/lib/api/client";
import { ListResult } from "@/features/admin/shared/types/admin_types";
import {
  AdminReading,
  AdminReadingListParams,
  UpdateReadingBody,
} from "../types/reading_admin_types";
import { mapAdminReadingList, mapReadingTopics } from "./reading_admin_mapper";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function getAdminReadings(
  params: AdminReadingListParams
): Promise<ListResult<AdminReading>> {
  const q = new URLSearchParams();
  q.set("page", String(params.page));
  q.set("limit", String(params.limit));
  if (params.search) q.set("search", params.search);
  if (params.topic !== "all") q.set("topic", params.topic);
  if (params.cefr !== "all") q.set("cefr", params.cefr);

  const raw = await apiFetch<unknown>(`/admin/reading?${q.toString()}`);
  return mapAdminReadingList(raw, params.limit);
}

export async function getReadingTopics(): Promise<string[]> {
  const raw = await apiFetch<unknown>("/admin/reading/topics");
  return mapReadingTopics(raw);
}

export async function updateAdminReading(id: string, body: UpdateReadingBody): Promise<void> {
  await apiFetch<unknown>(`/admin/reading/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export async function deleteAdminReading(id: string): Promise<void> {
  await apiFetch<unknown>(`/admin/reading/${id}`, { method: "DELETE" });
}