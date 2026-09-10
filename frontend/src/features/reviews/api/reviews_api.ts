import { apiFetch } from "@/lib/api/client";

export interface CreateReviewPayload {
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  durationMs: number;
  reviewedAt?: string;
}

export interface ReviewResult {
  review: { id: string; reviewTh: number; nextIntervalDays: number };
  card: { id: string; state: string; dueAt: string | null; reps: number; lapses: number };
  trungLap: boolean;
}

export function createReviewApi(payload: CreateReviewPayload): Promise<ReviewResult> {
  return apiFetch<ReviewResult>("/reviews", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}