import { AddCardsResult, DetectedWord, DetectResult } from "../types/image-learning_types";

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;

// BE có thể trả số lượng hoặc cả mảng, đọc được cả hai
const count = (v: unknown): number =>
  Array.isArray(v) ? v.length : typeof v === "number" && Number.isFinite(v) ? v : 0;

// Danh sách id: mảng chuỗi, hoặc mảng object có wordId / id
function ids(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : isObj(x) ? str(x.wordId ?? x.id) : ""))
    .filter(Boolean);
}

function mapWord(raw: Raw): DetectedWord {
  return {
    wordId: str(raw.wordId ?? raw.id),
    term: str(raw.term ?? raw.word),
    ipa: str(raw.ipa ?? raw.phonetic),
    pos: str(raw.pos ?? raw.type).toLowerCase(),
    meaningVi: str(raw.meaningVi ?? raw.meaning),
    exampleEn: str(raw.exampleEn),
    cefr: str(raw.cefr ?? raw.level).toUpperCase(),
    score: typeof raw.score === "number" && Number.isFinite(raw.score) ? raw.score : null,
    inDeck: raw.inDeck === true,
  };
}

export function mapDetectResult(raw: Raw): DetectResult {
  const items = Array.isArray(raw.items)
    ? raw.items.filter(isObj).map(mapWord).filter((w) => w.wordId && w.term)
    : [];

  return {
    items,
    imageUrl: str(raw.imageUrl),
    lowConfidence: raw.lowConfidence === true,
    degraded: raw.degraded === true,
    tau: typeof raw.tau === "number" ? raw.tau : null,
    latencyMs: typeof raw.latencyMs === "number" ? raw.latencyMs : null,
  };
}

// Kết quả tìm từ thủ công: không có độ tin cậy nên score = null
export function mapWordList(raw: unknown): DetectedWord[] {
  const list = Array.isArray(raw)
    ? raw
    : isObj(raw) && Array.isArray(raw.items)
      ? raw.items
      : isObj(raw) && Array.isArray(raw.data)
        ? raw.data
        : [];

  return list
    .filter(isObj)
    .map(mapWord)
    .filter((w) => w.wordId && w.term)
    .map((w) => ({ ...w, score: null }));
}

export function mapAddCardsResult(raw: unknown): AddCardsResult {
  const r: Raw = isObj(raw) ? raw : {};
  return {
    added: count(r.added),
    skippedExisting: count(r.skippedExisting),
    notFound: ids(r.notFound),
    exceededLimit: ids(r.exceededLimit),
    newCardCount: typeof r.newCardCount === "number" ? r.newCardCount : null,
    message: str(r.message),
  };
}