import { DetectedWord, DetectResult } from "../types/image-learning_types";

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;

const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

function mapWord(raw: Raw): DetectedWord {
  return {
    wordId: str(raw.wordId ?? raw.id),
    term: str(raw.term ?? raw.word),
    ipa: str(raw.ipa),
    pos: str(raw.pos).toLowerCase(),
    meaningVi: str(raw.meaningVi),
    exampleEn: str(raw.exampleEn),
    cefr: str(raw.cefr).toUpperCase(),
    score: num(raw.score),
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