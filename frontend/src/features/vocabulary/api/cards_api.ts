import { apiFetch } from "@/lib/api/client";
import { AddCardsResult, DeckCard, PagedMeta } from "../types/vocabulary_types";

interface Paged<T> {
  items: T[];
  meta: PagedMeta;
}

export function listCardsApi(page = 1, limit = 100): Promise<Paged<DeckCard>> {
  return apiFetch<Paged<DeckCard>>(`/cards?page=${page}&limit=${limit}`);
}

export function addCardsApi(wordIds: string[], force = false): Promise<AddCardsResult> {
  return apiFetch<AddCardsResult>("/cards", {
    method: "POST",
    body: JSON.stringify({ wordIds, force }),
  });
}

export function removeCardApi(cardId: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/cards/${cardId}`, { method: "DELETE" });
}

export function listNewCardsApi(
  limit?: number,
): Promise<{ items: DeckCard[]; dailyLimit: number; count: number }> {
  const qs = limit ? `?limit=${limit}` : "";
  return apiFetch<{ items: DeckCard[]; dailyLimit: number; count: number }>(`/cards/new${qs}`);
}