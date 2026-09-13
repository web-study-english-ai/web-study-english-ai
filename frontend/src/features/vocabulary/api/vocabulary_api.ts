import { apiFetch } from "@/lib/api/client";
import {
  PagedMeta,
  Topic,
  VocabularyDetail,
  VocabularyFilters,
  VocabularyItem,
} from "../types/vocabulary_types";

interface Paged<T> {
  items: T[];
  meta: PagedMeta;
}

export function listTopicsApi(): Promise<Topic[]> {
  return apiFetch<Topic[]>("/topics");
}

export function searchWordsApi(
  filters: VocabularyFilters,
  page = 1,
): Promise<Paged<VocabularyItem>> {
  const params = new URLSearchParams({ page: String(page), limit: "20" });

  const tuKhoa = filters.query.trim();
  if (tuKhoa) params.set("search", tuKhoa);
  if (filters.topicId !== "all") params.set("topicId", filters.topicId);
  if (filters.level !== "all") params.set("cefr", filters.level);

  return apiFetch<Paged<VocabularyItem>>(`/words?${params.toString()}`);
}

export function getWordByIdApi(id: string): Promise<VocabularyDetail> {
  return apiFetch<VocabularyDetail>(`/words/${id}`);
}