import { apiFetch } from "@/lib/api/client";
import {
  AttemptPayload,
  ReadingDetailData,
  ReadingListParams,
  ReadingListResult,
  SubmitResult,
} from "../types/reading_types";
import {
  mapReadingDetail,
  mapReadingList,
  mapSubmitResult,
} from "./reading_mapper";
import {
  getMockReadingDetailRaw,
  getMockReadingListRaw,
  mockSaveReadingDraft,
  mockSubmitReading,
} from "./reading_mock";

const MOCK_MODE = process.env.NEXT_PUBLIC_READING_MOCK;
const JSON_HEADERS = { "Content-Type": "application/json" };

export async function getReadingList(
  params: ReadingListParams
): Promise<ReadingListResult> {
  if (MOCK_MODE) {
    return mapReadingList(await getMockReadingListRaw(MOCK_MODE, params));
  }

  const q = new URLSearchParams();
  if (params.search.trim()) q.set("search", params.search.trim());
  if (params.cefr !== "all") q.set("cefr", params.cefr);
  if (params.topic !== "all") q.set("topic", params.topic);
  if (params.status !== "all") q.set("status", params.status);
  if (params.sort) q.set("sort", params.sort);
  q.set("page", String(params.page));
  q.set("limit", String(params.limit));

  const raw = await apiFetch<Record<string, unknown>>(`/reading?${q.toString()}`);
  return mapReadingList(raw);
}

export async function getReadingDetail(id: string): Promise<ReadingDetailData> {
  if (MOCK_MODE) {
    return mapReadingDetail(await getMockReadingDetailRaw(MOCK_MODE, id));
  }

  const raw = await apiFetch<Record<string, unknown>>(`/reading/${id}`);
  return mapReadingDetail(raw);
}

export async function saveReadingDraft(
  id: string,
  payload: AttemptPayload
): Promise<void> {
  if (MOCK_MODE) {
    await mockSaveReadingDraft(MOCK_MODE, id, payload);
    return;
  }

  await apiFetch<unknown>(`/reading/${id}/draft`, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export async function submitReading(
  id: string,
  payload: AttemptPayload
): Promise<SubmitResult> {
  if (MOCK_MODE) {
    return mapSubmitResult(await mockSubmitReading(MOCK_MODE, id, payload));
  }

  const raw = await apiFetch<Record<string, unknown>>(`/reading/${id}/submit`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  return mapSubmitResult(raw);
}