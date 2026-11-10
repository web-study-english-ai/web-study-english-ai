import { apiFetch } from "@/lib/api/client";
import { ListResult } from "@/features/admin/shared/types/admin_types";
import {
  AdminReading,
  ReadingListParams,
  UpdateReadingBody,
} from "../types/reading_admin_types";
import { mapReadingList, mapTopics } from "./reading_admin_mapper";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function getAdminReadings(
  params: ReadingListParams
): Promise<ListResult<AdminReading>> {
  const q = new URLSearchParams();
  q.set("page", String(params.page));
  q.set("limit", String(params.limit));
  if (params.search) q.set("search", params.search);
  if (params.topic !== "all") q.set("topic", params.topic);
  if (params.cefr !== "all") q.set("cefr", params.cefr);

  const raw = await apiFetch<unknown>(`/admin/reading?${q.toString()}`);
  return mapReadingList(raw, params.limit);
}

export async function getReadingTopics(): Promise<string[]> {
  const raw = await apiFetch<unknown>("/admin/reading/topics");
  return mapTopics(raw);
}

export async function updateAdminReading(
  id: string,
  body: UpdateReadingBody
): Promise<void> {
  await apiFetch<unknown>(`/admin/reading/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export async function deleteAdminReading(id: string): Promise<void> {
  await apiFetch<unknown>(`/admin/reading/${id}`, { method: "DELETE" });
}

export interface CreateQuestionPayload {
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  explanation?: string;
}

export interface CreateReadingPayload {
  title: string;
  summary?: string;
  content: string;
  topic: string;
  cefr: string;
  estimatedMinutes: number;
  questions: CreateQuestionPayload[];
}

export async function createAdminReadingApi(body: CreateReadingPayload): Promise<void> {
  await apiFetch<unknown>("/admin/reading", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}