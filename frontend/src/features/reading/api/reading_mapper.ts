import {
  ReadingDetailData,
  ReadingDraft,
  ReadingItem,
  ReadingListResult,
  ReadingQuestion,
  ReadingStatus,
  ReadingTopic,
  SubmitResult,
} from "../types/reading_types";

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;

const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

// Lấy giá trị đầu tiên có tồn tại trong danh sách tên trường có thể có
const pick = (r: Raw, keys: string[]): unknown => {
  for (const k of keys) {
    if (r[k] !== undefined && r[k] !== null) return r[k];
  }
  return undefined;
};

function toStatus(v: unknown): ReadingStatus {
  return v === "IN_PROGRESS" || v === "COMPLETED" ? v : "NOT_STARTED";
}

function topicLabel(v: unknown): string {
  return isObj(v) ? str(pick(v, ["name", "title", "label", "slug"])) : str(v);
}

function topicValue(v: unknown): string {
  return isObj(v) ? str(pick(v, ["slug", "id", "value", "name"])) : str(v);
}

export function mapReadingItem(raw: Raw): ReadingItem {
  const p: Raw = isObj(raw.userProgress) ? raw.userProgress : {};
  const minutes = pick(raw, [
    "estimatedMinutes",
    "readingTimeMinutes",
    "durationMinutes",
    "estimatedReadingMinutes",
  ]);

  return {
    id: str(raw.id),
    title: str(raw.title),
    description: str(pick(raw, ["description", "summary", "excerpt"])),
    cefr: str(pick(raw, ["cefr", "level", "cefrLevel"])).toUpperCase(),
    topic: topicLabel(pick(raw, ["topic", "topicName"])),
    estimatedMinutes: typeof minutes === "number" ? minutes : null,
    progress: {
      status: toStatus(p.status),
      answeredCount: num(p.answeredCount),
      correctCount: num(p.correctCount),
      totalQuestions: num(
        p.totalQuestions,
        num(pick(raw, ["totalQuestions", "questionCount"]))
      ),
    },
  };
}

export function mapReadingList(raw: Raw): ReadingListResult {
  const items = Array.isArray(raw.items)
    ? raw.items.filter(isObj).map(mapReadingItem)
    : [];

  const seen = new Set<string>();
  const topics: ReadingTopic[] = [];
  if (Array.isArray(raw.topics)) {
    for (const t of raw.topics) {
      const value = topicValue(t);
      if (value && !seen.has(value)) {
        seen.add(value);
        topics.push({ value, label: topicLabel(t) || value });
      }
    }
  }

  const m: Raw = isObj(raw.meta) ? raw.meta : {};
  const limit = num(m.limit, items.length || 1);
  const total = num(m.total, items.length);

  return {
    items,
    topics,
    meta: {
      page: num(m.page, 1),
      limit,
      total,
      totalPages: num(
        pick(m, ["totalPages", "pageCount"]),
        Math.max(1, Math.ceil(total / limit))
      ),
    },
  };
}

function mapDraft(v: unknown): ReadingDraft | null {
  const src: Raw | null = Array.isArray(v) ? { answers: v } : isObj(v) ? v : null;
  if (!src) return null;

  const answers = Array.isArray(src.answers)
    ? src.answers
        .filter(isObj)
        .map((a) => ({
          questionId: str(a.questionId),
          selectedOptionIndex: num(a.selectedOptionIndex, -1),
        }))
        .filter((a) => a.questionId && a.selectedOptionIndex >= 0)
    : [];

  return { durationSeconds: num(src.durationSeconds), answers };
}

export function mapReadingDetail(raw: Raw): ReadingDetailData {
  const base: Raw = isObj(raw.reading) ? raw.reading : raw;
  const rawQuestions: unknown[] = Array.isArray(raw.questions)
    ? raw.questions
    : Array.isArray(base.questions)
      ? base.questions
      : [];

  const questions: ReadingQuestion[] = rawQuestions
    .filter(isObj)
    .map((q, i) => ({
      id: str(q.id),
      orderIndex: num(q.orderIndex, i),
      questionText: str(q.questionText),
      options: Array.isArray(q.options) ? q.options.map((o) => str(o)) : [],
    }))
    .sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    id: str(base.id),
    title: str(base.title),
    cefr: str(pick(base, ["cefr", "level", "cefrLevel"])).toUpperCase(),
    topic: topicLabel(pick(base, ["topic", "topicName"])),
    content: str(pick(base, ["content", "body", "passage", "text"])),
    questions,
    draft: mapDraft(pick(raw, ["draftAttempt", "draft"])),
  };
}

export function mapSubmitResult(raw: Raw): SubmitResult {
  const results = Array.isArray(raw.results)
    ? raw.results.filter(isObj).map((r) => ({
        questionId: str(r.questionId),
        correctOptionIndex: num(r.correctOptionIndex, -1),
        explanation: str(r.explanation),
      }))
    : [];

  return {
    correctCount: num(raw.correctCount),
    wrongCount: num(raw.wrongCount),
    totalQuestions: num(raw.totalQuestions, results.length),
    results,
  };
}