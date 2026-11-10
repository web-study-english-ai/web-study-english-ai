import { isObj, mapList, num, Raw, str } from "@/features/admin/shared/lib/admin_mapper";
import { AdminReading } from "../types/reading_admin_types";

export function mapAdminReading(raw: Raw): AdminReading {
  const t = raw.topic;
  return {
    id: str(raw.id),
    code: str(raw.code),
    slug: str(raw.slug),
    title: str(raw.title),
    summary: str(raw.summary),
    topic: isObj(t) ? str(t.name ?? t.title) : str(t),
    cefr: str(raw.cefr).toUpperCase(),
    wordCount: num(raw.wordCount),
    estimatedMinutes: num(raw.estimatedMinutes),
    questionCount: num(raw.questionCount),
    createdAt: str(raw.createdAt),
  };
}

export const mapReadingList = (raw: unknown, limit: number) =>
  mapList(raw, mapAdminReading, limit);

// BE trả mảng chuỗi ["Giáo dục", "Du lịch", ...]
export function mapTopics(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : isObj(raw) && Array.isArray(raw.items)
      ? raw.items
      : [];

  const names = list
    .map((t) => (isObj(t) ? str(t.name ?? t.title) : str(t)))
    .filter(Boolean);
  return Array.from(new Set(names));
}