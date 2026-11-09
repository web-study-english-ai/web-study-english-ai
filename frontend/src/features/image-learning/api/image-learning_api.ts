import { apiFetch } from "@/lib/api/client";
import {
  AddCardsPayload,
  AddCardsResult,
  DetectedWord,
  DetectResult,
} from "../types/image-learning_types";
import { mapAddCardsResult, mapDetectResult, mapWordList } from "./image-learning_mapper";
import { getMockDetectRaw, getMockSearchRaw, mockAddCards } from "./image-learning_mock";

const MOCK_MODE = process.env.NEXT_PUBLIC_VISION_MOCK;
const JSON_HEADERS = { "Content-Type": "application/json" };

// Đường dẫn tìm từ thủ công là mình ĐOÁN (giống trang /vocabulary).
// Mở /vocabulary, F12, tab Network để xem đường dẫn thật rồi sửa dòng này.
const WORD_SEARCH_PATH = "/vocabulary";

export async function detectVocabulary(image: File): Promise<DetectResult> {
  if (MOCK_MODE) return mapDetectResult(await getMockDetectRaw(MOCK_MODE));

  const form = new FormData();
  form.append("image", image, image.name);

  // Không tự đặt Content-Type: trình duyệt tự thêm boundary cho multipart/form-data
  const raw = await apiFetch<Record<string, unknown>>("/vision/detect", {
    method: "POST",
    body: form,
  });
  return mapDetectResult(raw);
}

export async function searchWords(term: string): Promise<DetectedWord[]> {
  if (MOCK_MODE) return mapWordList(await getMockSearchRaw(MOCK_MODE, term));

  const q = new URLSearchParams({ search: term, limit: "8" });
  const raw = await apiFetch<unknown>(`${WORD_SEARCH_PATH}?${q.toString()}`);
  return mapWordList(raw);
}

export async function addCards(payload: AddCardsPayload): Promise<AddCardsResult> {
  if (MOCK_MODE) return mapAddCardsResult(await mockAddCards(MOCK_MODE, payload));

  const raw = await apiFetch<unknown>("/cards", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  return mapAddCardsResult(raw);
}