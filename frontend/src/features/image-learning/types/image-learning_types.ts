export interface DetectedWord {
  wordId: string;
  term: string;
  ipa: string;
  pos: string; // "noun", "verb"...
  meaningVi: string;
  exampleEn: string;
  cefr: string;
  score: number | null; // null khi từ do người học tự tìm (không có độ tin cậy)
  inDeck: boolean;
}

export interface DetectResult {
  items: DetectedWord[];
  imageUrl: string;
  lowConfidence: boolean;
  degraded: boolean;
  tau: number | null;
  latencyMs: number | null;
}

export interface AddCardsPayload {
  wordIds: string[];
  imageUrl?: string;
  force: boolean;
}

export interface AddCardsResult {
  added: number;
  skippedExisting: number;
  notFound: string[];
  exceededLimit: string[];
  newCardCount: number | null;
  message: string;
}