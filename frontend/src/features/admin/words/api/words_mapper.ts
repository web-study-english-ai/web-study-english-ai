import { isObj, mapList, Raw, str } from "@/features/admin/shared/lib/admin_mapper";
import { AdminWord, WordTopic } from "../types/words_types";

export function mapWord(raw: Raw): AdminWord {
  const t = isObj(raw.topic) ? raw.topic : null;
  return {
    id: str(raw.id),
    term: str(raw.term),
    pos: str(raw.pos).toUpperCase(),
    ipa: str(raw.ipa),
    meaningVi: str(raw.meaningVi),
    exampleEn: str(raw.exampleEn),
    cefr: str(raw.cefr).toUpperCase(),
    rank: typeof raw.rank === "number" ? raw.rank : null,
    topic: t ? { id: str(t.id), name: str(t.name ?? t.slug) } : null,
  };
}

export const mapWordList = (raw: unknown, limit: number) => mapList(raw, mapWord, limit);

export function mapTopics(raw: unknown): WordTopic[] {
  const list = Array.isArray(raw)
    ? raw
    : isObj(raw) && Array.isArray(raw.items)
      ? raw.items
      : isObj(raw) && Array.isArray(raw.data)
        ? raw.data
        : [];

  return list
    .filter(isObj)
    .map((t) => ({ id: str(t.id), name: str(t.name ?? t.title ?? t.slug) }))
    .filter((t) => t.id && t.name);
}