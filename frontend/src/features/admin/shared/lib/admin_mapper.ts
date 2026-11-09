import { ListResult, PageMeta } from "../types/admin_types";

export type Raw = Record<string, unknown>;

export const isObj = (v: unknown): v is Raw =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;

export const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

export function mapMeta(raw: unknown, itemCount: number, fallbackLimit: number): PageMeta {
  const m: Raw = isObj(raw) ? raw : {};
  const limit = num(m.limit, fallbackLimit) || fallbackLimit;
  const total = num(m.total, itemCount);
  return {
    page: num(m.page, 1),
    limit,
    total,
    totalPages: num(m.totalPages, Math.max(1, Math.ceil(total / limit))),
  };
}

export function mapList<T>(
  raw: unknown,
  mapItem: (r: Raw) => T,
  fallbackLimit: number
): ListResult<T> {
  const src: Raw = isObj(raw) ? raw : {};
  const list = Array.isArray(src.items) ? src.items : Array.isArray(src.data) ? src.data : [];
  const items = list.filter(isObj).map(mapItem);
  return { items, meta: mapMeta(src.meta, items.length, fallbackLimit) };
}