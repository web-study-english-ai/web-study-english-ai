export type WordType = "n" | "v" | "adj" | "adv";

export interface VocabularyItem {
  id: string;
  word: string;
  ipa: string;
  type: WordType;
  meaningVi: string;
  topic: string;
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  definition: string;
  exampleEn: string;
  exampleVi: string;
}

export interface VocabularyFilters {
  query: string;  
  topic: string | "all";
  level: string | "all";
}

export type SRSRating = "forgot" | "hard" | "medium" | "easy";

export interface WordProgressRecord {
  wordId: string;
  rating: SRSRating;
  responseTimeMs: number;
  isIdle: boolean; // true nếu người học rời màn hình quá lâu trong lúc xem thẻ này
  reviewedAt: string; // ISO date
  nextReviewAt: string; // ISO date, dùng cho trang "Ôn tập theo lịch" sau này
}