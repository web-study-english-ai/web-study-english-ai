import { apiFetch } from "@/lib/api/client";
import { AddCardsPayload, DetectResult } from "../types/image-learning_types";
import { mapDetectResult } from "./image-learning_mapper";
import { getMockDetectRaw, mockAddCards } from "./image-learning_mock";

const MOCK_MODE = process.env.NEXT_PUBLIC_VISION_MOCK;
const JSON_HEADERS = { "Content-Type": "application/json" };

export async function detectVocabulary(image: File): Promise<DetectResult> {
  if (MOCK_MODE) return mapDetectResult(await getMockDetectRaw(MOCK_MODE));

  const form = new FormData();
  form.append("image", image, image.name);

  // KHÔNG tự đặt Content-Type: trình duyệt sẽ tự thêm boundary cho multipart/form-data
  const raw = await apiFetch<Record<string, unknown>>("/vision/detect", {
    method: "POST",
    body: form,
  });
  return mapDetectResult(raw);
}

export async function addCards(payload: AddCardsPayload): Promise<void> {
  if (MOCK_MODE) {
    await mockAddCards(MOCK_MODE);
    return;
  }

  await apiFetch<unknown>("/cards", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}