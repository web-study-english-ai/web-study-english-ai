import { apiFetch, setAccessToken, ApiError } from "@/lib/api/client";
import {
  AuthError,
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  User,
} from "../types/auth_types";

interface BackendUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
}

interface BackendAuth {
  user: BackendUser;
  accessToken: string;
}

/** Nơi duy nhất quy đổi tên trường giữa backend và giao diện */
function mapUser(u: BackendUser): User {
  return {
    id: u.id,
    name: u.fullName,
    email: u.email,
    avatarUrl: u.avatarUrl,
    role: u.role,
  };
}

export function toAuthError(err: unknown): AuthError {
  if (!(err instanceof ApiError)) {
    return new AuthError("UNKNOWN", "Đã có lỗi xảy ra, vui lòng thử lại.");
  }
  if (err.status === 0) return new AuthError("NETWORK_ERROR", err.message);
  if (err.status === 401) return new AuthError("INVALID_CREDENTIALS", err.message);
  if (err.status === 409) return new AuthError("EMAIL_ALREADY_EXISTS", err.message);
  if (err.status === 400) return new AuthError("WEAK_PASSWORD", err.message);
  return new AuthError("UNKNOWN", err.message);
}

export async function loginApi(payload: LoginPayload): Promise<AuthResponse> {
  const res = await apiFetch<BackendAuth>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setAccessToken(res.accessToken);
  return { user: mapUser(res.user), token: res.accessToken };
}

export async function registerApi(payload: RegisterPayload): Promise<void> {
  await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      fullName: payload.name,
      email: payload.email,
      password: payload.password,
      confirmPassword: payload.confirmPassword,
    }),
  });
}

export async function logoutApi(): Promise<void> {
  await apiFetch("/auth/logout", { method: "POST" });
  setAccessToken(null);
}

/** Khôi phục phiên sau khi tải lại trang, dựa vào refresh cookie */
export async function restoreSessionApi(): Promise<AuthResponse | null> {
  try {
    const res = await apiFetch<BackendAuth>("/auth/refresh", { method: "POST" }, false);
    setAccessToken(res.accessToken);
    return { user: mapUser(res.user), token: res.accessToken };
  } catch {
    return null;
  }
}