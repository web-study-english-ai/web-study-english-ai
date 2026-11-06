export interface DetectedWord {
  wordId: string;
  term: string;
  ipa: string;
  pos: string; // "noun", "verb"...
  meaningVi: string;
  exampleEn: string;
  cefr: string;
  score: number;
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