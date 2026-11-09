import { apiFetch } from "@/lib/api/client";
import { ListResult } from "@/features/admin/shared/types/admin_types";
import { AdminWord, UpdateWordBody, WordListParams, WordTopic } from "../types/words_types";
import { mapTopics, mapWordList } from "./words_mapper";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function getAdminWords(params: WordListParams): Promise<ListResult<AdminWord>> {
  const q = new URLSearchParams();
  q.set("page", String(params.page));
  q.set("limit", String(params.limit));
  if (params.search) q.set("search", params.search);
  if (params.topicId !== "all") q.set("topicId", params.topicId);
  if (params.cefr !== "all") q.set("cefr", params.cefr);

  const raw = await apiFetch<unknown>(`/admin/words?${q.toString()}`);
  return mapWordList(raw, params.limit);
}

export async function getWordTopics(): Promise<WordTopic[]> {
  const raw = await apiFetch<unknown>("/topics");
  return mapTopics(raw);
}

export async function updateAdminWord(id: string, body: UpdateWordBody): Promise<void> {
  await apiFetch<unknown>(`/admin/words/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export async function deleteAdminWord(id: string): Promise<void> {
  await apiFetch<unknown>(`/admin/words/${id}`, { method: "DELETE" });
}