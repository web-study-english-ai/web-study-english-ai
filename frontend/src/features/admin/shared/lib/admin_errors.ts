export function getErrorStatus(err: unknown): number | null {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
}

export function isForbidden(err: unknown): boolean {
  const status = getErrorStatus(err);
  return status === 401 || status === 403;
}

// Lỗi 4xx thì hiện lời nhắn của Backend (ví dụ trùng dữ liệu), còn lại hiện câu mặc định
export function errorMessage(err: unknown, fallback: string): string {
  const status = getErrorStatus(err);
  if (err instanceof Error && err.message && status !== null && status >= 400 && status < 500) {
    return err.message;
  }
  return fallback;
}

// Không thử lại khi bị từ chối quyền, để thông báo hiện ngay
export function adminRetry(failureCount: number, error: unknown): boolean {
  return !isForbidden(error) && failureCount < 1;
}