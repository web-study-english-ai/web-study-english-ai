// score là xác suất softmax trên 449 nhãn (ngưỡng tin cậy 0,10), từ đúng thường 0,15 đến 0,75.
// Lấy căn bậc hai để số % hiển thị dễ nhìn hơn, theo gợi ý của BE.
// Đây chỉ là cách hiển thị, KHÔNG phải xác suất thật.
// Muốn hiện đúng xác suất gốc, đổi thành: Math.max(1, Math.round(score * 100))
export function toMatchPercent(score: number): number {
  const s = Math.min(Math.max(score, 0), 1);
  return Math.min(99, Math.max(1, Math.round(Math.sqrt(s) * 100)));
}

// ApiError của client.ts có trường status (số)
function getErrorStatus(err: unknown): number | null {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
}

export const isServiceUnavailable = (err: unknown) => getErrorStatus(err) === 503;
export const isLimitExceeded = (err: unknown) => getErrorStatus(err) === 409;