export type PartOfSpeech =
  | "NOUN" | "VERB" | "ADJECTIVE" | "ADVERB" | "PREPOSITION"
  | "PRONOUN" | "CONJUNCTION" | "INTERJECTION" | "NUMERAL";

export type CefrLevel = "A1" | "A2" | "B1" | "B2";

export const POS_LABEL: Record<PartOfSpeech, string> = {
  NOUN: "danh từ",
  VERB: "động từ",
  ADJECTIVE: "tính từ",
  ADVERB: "trạng từ",
  PREPOSITION: "giới từ",
  PRONOUN: "đại từ",
  CONJUNCTION: "liên từ",
  INTERJECTION: "thán từ",
  NUMERAL: "số từ",
};

export interface Topic {
  id: string;
  slug: string;
  name: string;
}

/** Một từ trong danh sách kết quả tìm kiếm */
export interface VocabularyItem {
  id: string;
  term: string;
  rank: number;
  cefr: CefrLevel;
  pos: PartOfSpeech;
  ipa: string | null;
  meaningVi: string;
  topic: Topic | null;
}

export interface Pronunciation {
  term: string;
  phoneticText: string | null;
  audioUrl: string | null;
  definitions: { partOfSpeech: string; definition: string }[];
  available: boolean;
}

/** Chi tiết một từ, có thêm ví dụ và phát âm */
export interface VocabularyDetail extends VocabularyItem {
  exampleEn: string | null;
  isConcreteNoun: boolean;
  freqPerMillion: number | null;
  pronunciation: Pronunciation;
}

export interface VocabularyFilters {
  query: string;
  topicId: string | "all";
  level: CefrLevel | "all";
}

export interface PagedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type CardState = "NEW" | "LEARNING" | "REVIEW" | "RELEARNING";

/** Một thẻ trong bộ thẻ cá nhân — id là id của THẺ, từ nằm trong .word */
export interface DeckCard {
  id: string;
  state: CardState;
  dueAt: string | null;
  createdAt: string;
  word: {
    id: string;
    term: string;
    cefr: CefrLevel;
    pos: PartOfSpeech;
    ipa: string | null;
    meaningVi: string;
    exampleEn: string | null;
    topic: Topic | null;
  };
}

export interface AddCardsResult {
  added: number;
  skippedExisting: number;
  notFound: number;
  exceededLimit: boolean;
  newCardCount: number;
  message: string;
}
export type SRSRating = "forgot" | "hard" | "medium" | "easy";

/** Ánh xạ nhãn giao diện sang mức 1–4 mà backend nhận */
export const RATING_VALUE: Record<SRSRating, 1 | 2 | 3 | 4> = {
  forgot: 1,
  hard: 2,
  medium: 3,
  easy: 4,
};