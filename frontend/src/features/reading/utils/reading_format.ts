import { CefrLevel, ReadingStatus } from "../types/reading_types";

export const CEFR_FILTERS: (CefrLevel | "all")[] = ["all", "A1", "A2", "B1", "B2", "C1"];

export const STATUS_OPTIONS: { value: ReadingStatus | "all"; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "NOT_STARTED", label: "Chưa làm" },
  { value: "IN_PROGRESS", label: "Đang làm" },
  { value: "COMPLETED", label: "Đã hoàn thành" },
];

// Giá trị "sort" ngoài mục đầu là mình ĐOÁN, cần khớp với BE
export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Đề xuất cho bạn" },
  { value: "cefr_asc", label: "Từ cơ bản đến nâng cao" },
  { value: "cefr_desc", label: "Từ nâng cao đến cơ bản" },
];

export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function optionLetter(index: number) {
  return String.fromCharCode(65 + index);
}

export function levelStyle(cefr: string) {
  if (cefr.startsWith("A")) return "bg-green-100 text-green-700";
  if (cefr.startsWith("B")) return "bg-teal-100 text-teal-700";
  if (cefr.startsWith("C")) return "bg-violet-100 text-violet-700";
  return "bg-muted text-muted-foreground";
}