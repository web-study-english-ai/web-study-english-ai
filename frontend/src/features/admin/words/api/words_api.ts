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

// ==================== CÁC HÀM CHO TÍNH NĂNG NẠP FILE CSV ====================
export interface PreviewRow {
  rowNumber: number;
  term: string;
  pos: string;
  meaningVi: string;
  cefr: string;
  topic: string;
  ipa?: string | null;
  exampleEn?: string | null;
  isValid: boolean;
  errorMessage?: string;
}

export interface PreviewFileResponse {
  total: number;
  validCount: number;
  errorCount: number;
  rows: PreviewRow[];
}

export async function previewWordsFileApi(file: File): Promise<PreviewFileResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<PreviewFileResponse>("/admin/words/preview-file", {
    method: "POST",
    body: formData,
  });
}

export function importWordsApi(
  words: Omit<PreviewRow, "rowNumber" | "isValid" | "errorMessage">[]
): Promise<{ message: string; inserted: number; updated: number }> {
  return apiFetch<{ message: string; inserted: number; updated: number }>("/admin/words/import", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ words }),
  });
}