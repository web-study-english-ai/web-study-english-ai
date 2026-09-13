import { AuthError, AuthResponse, LoginPayload, RegisterPayload } from "../types/auth_types";

const FAKE_DELAY = 900;

// Tài khoản giả lập sẵn để test đăng nhập thành công
const MOCK_USERS = [
  { id: "1", name: "Nguyễn Văn A", email: "test@gmail.com", password: "123456" },
];

const EXISTING_EMAILS = ["taken@gmail.com"];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loginMock(payload: LoginPayload): Promise<AuthResponse> {
  await delay(FAKE_DELAY);

  // Giả lập mất mạng nếu email chứa "offline"
  if (payload.email.includes("offline")) {
    throw new AuthError("NETWORK_ERROR", "Không thể kết nối tới máy chủ.");
  }

  const user = MOCK_USERS.find((u) => u.email === payload.email);

  if (!user || user.password !== payload.password) {
    throw new AuthError("INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng.");
  }

  return {
    user: { id: user.id, name: user.name, email: user.email },
    token: "mock-jwt-token-" + user.id,
  };
}

export async function registerMock(payload: RegisterPayload): Promise<AuthResponse> {
  await delay(FAKE_DELAY);

  if (payload.email.includes("offline")) {
    throw new AuthError("NETWORK_ERROR", "Không thể kết nối tới máy chủ.");
  }

  if (EXISTING_EMAILS.includes(payload.email)) {
    throw new AuthError("EMAIL_ALREADY_EXISTS", "Email này đã được sử dụng.");
  }

  if (payload.password.length < 6) {
    throw new AuthError("WEAK_PASSWORD", "Mật khẩu phải có ít nhất 6 ký tự.");
  }

  return {
    user: { id: String(Date.now()), name: payload.name, email: payload.email },
    token: "mock-jwt-token-" + Date.now(),
  };
}