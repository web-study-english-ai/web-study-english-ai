// API quản trị chỉ nhận A1 đến B2 khi lọc và sửa
export const ADMIN_CEFR = ["A1", "A2", "B1", "B2"];

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("vi-VN");
}

// Thêm giá trị hiện tại vào danh sách lựa chọn nếu danh sách không có sẵn
export function uniqueOptions(base: string[], current: string): string[] {
  return current && !base.includes(current) ? [...base, current] : base;
}

// ---- Từ loại ----
const POS_SHORT: Record<string, string> = {
  NOUN: "n",
  VERB: "v",
  ADJECTIVE: "adj",
  ADVERB: "adv",
  PREPOSITION: "prep",
  CONJUNCTION: "conj",
  PRONOUN: "pron",
  INTERJECTION: "interj",
};

const POS_LONG: Record<string, string> = {
  NOUN: "Danh từ (n)",
  VERB: "Động từ (v)",
  ADJECTIVE: "Tính từ (adj)",
  ADVERB: "Trạng từ (adv)",
};

export const POS_OPTIONS = ["NOUN", "VERB", "ADJECTIVE", "ADVERB"];

export const posShort = (pos: string) => POS_SHORT[pos.toUpperCase()] ?? pos.toLowerCase();
export const posLong = (pos: string) => POS_LONG[pos.toUpperCase()] ?? pos;

// ---- Vai trò ----
const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Quản trị viên",
  EDITOR: "Biên tập viên",
  USER: "Học viên",
};

export const ROLE_OPTIONS = ["ADMIN", "USER"];

export const roleLabel = (role: string) => ROLE_LABEL[role.toUpperCase()] ?? role;