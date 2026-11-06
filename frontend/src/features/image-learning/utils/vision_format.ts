// Điểm (score) 0–1 của BE là xác suất Softmax của mô hình CLIP tính trên toàn bộ 449 nhãn
// từ vựng (tổng điểm của cả 449 từ = 1, ngưỡng tin cậy tau = 0.10).
// Vì vậy từ đứng top 1 thường chỉ ~15–75%, còn các từ top 2–5 hay chỉ ~1–9%, thậm chí < 1%.

function clamp01(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(Math.max(score, 0), 1);
}

// Dùng cho thanh tiến trình / độ rộng: luôn trả về số nguyên >= 1,
// để các từ xếp sau không bị làm tròn thành "0% match".
export function toMatchPercent(score: number): number {
  return Math.max(1, Math.round(clamp01(score) * 100));
}

// Dùng cho chữ hiển thị: dưới 1% thì hiện "< 1%" thay vì làm tròn lên "1%" cho đỡ sai lệch.
export function formatMatchPercent(score: number): string {
  const raw = clamp01(score) * 100;
  return raw < 1 ? "< 1%" : `${Math.round(raw)}%`;
}

// Nhận biết lỗi 503 (dịch vụ AI tạm ngưng) từ lỗi mà apiFetch ném ra
export function isServiceUnavailable(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
    message?: unknown;
  };
  if (e.status === 503 || e.statusCode === 503 || e.response?.status === 503) return true;
  return typeof e.message === "string" && /\b503\b/.test(e.message);
}