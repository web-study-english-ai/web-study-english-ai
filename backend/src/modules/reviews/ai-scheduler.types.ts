import { CardState, SchedulerSource } from '@prisma/client';

/** Một thẻ gửi sang dịch vụ AI. Tên trường snake_case theo đúng API_CONTRACT.md v0.2 */
export interface TheGuiAI {
  card_id: string;
  stability: number | null;
  difficulty: number | null;
  elapsed_days: number;
  rating: number;
}

export interface KetQuaTheAI {
  card_id: string;
  retrievability: number | null;
  new_stability: number;
  new_difficulty: number;
  interval_days: number;
}

export interface PhanHoiDuBao {
  results: KetQuaTheAI[];
  model_version: string;
}

/** Kết quả lập lịch mà service dùng, không phụ thuộc đường nào tính ra nó. */
export interface KetQuaLapLich {
  stateAfter: CardState;
  nextIntervalDays: number;
  dueAt: Date;
  laQuen: boolean;
  difficultyAfter: number | null;
  stabilityAfter: number | null;
  predictedRetrievability: number | null;
  scheduler: SchedulerSource;
  modelVersion: string | null;
}
