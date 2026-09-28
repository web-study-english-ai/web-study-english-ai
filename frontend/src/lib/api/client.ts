const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// Access token giữ trong bộ nhớ, KHÔNG dùng localStorage
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Nhiều request cùng nhận 401 thì chỉ gọi refresh một lần
export interface KetQuaLamMoi {
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    role: string;
  };
  accessToken: string;
}

let dangLamMoi: Promise<KetQuaLamMoi | null> | null = null;

/** Đường DUY NHẤT gọi /auth/refresh. Mọi nơi cần làm mới phiên đều phải đi qua đây. */
export function lamMoiPhien(): Promise<KetQuaLamMoi | null> {
  dangLamMoi ??= fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as KetQuaLamMoi;
      accessToken = data.accessToken;
      return data;
    })
    .catch(() => null)
    .finally(() => {
      dangLamMoi = null;
    });

  return dangLamMoi;
}

function docThongBaoLoi(body: unknown): string {
  const message = (body as { message?: unknown })?.message;
  if (Array.isArray(message)) return String(message[0]);
  if (typeof message === "string") return message;
  return "Đã có lỗi xảy ra, vui lòng thử lại.";
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  choPhepThuLai = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError(0, "Không thể kết nối tới máy chủ.");
  }

    if (res.status === 401 && choPhepThuLai && !path.startsWith("/auth/")) {
    const ketQua = await lamMoiPhien();
    if (ketQua) return apiFetch<T>(path, init, false);
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, docThongBaoLoi(body));

  return body as T;
}