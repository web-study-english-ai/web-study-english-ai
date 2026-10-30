import { ProfileData, UpdateProfilePayload } from "../types/profile_types";

const DELAY = 500;
const STATE_KEY = "profile_mock_state";
const AUTH_USER_KEY = "auth_user";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_PROFILE: ProfileData = {
  name: "Minh Ngô",
  email: "minhngo.dev@domain.com",
  avatarUrl: null,
  language: "vi",
};

function readAuthUser(): { name?: string; email?: string } {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return {};
    const user = JSON.parse(raw) as { name?: unknown; email?: unknown };
    return {
      name: typeof user.name === "string" ? user.name : undefined,
      email: typeof user.email === "string" ? user.email : undefined,
    };
  } catch {
    return {};
  }
}

function readState(): ProfileData {
  const auth = readAuthUser();
  let saved: Partial<ProfileData> = {};

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) saved = JSON.parse(raw) as Partial<ProfileData>;
    } catch {
      // dữ liệu hỏng thì dùng lại dữ liệu mẫu
    }
  }

  return {
    ...DEFAULT_PROFILE,
    ...(auth.name ? { name: auth.name } : {}),
    ...saved,
    email: auth.email ?? DEFAULT_PROFILE.email, // email luôn lấy theo tài khoản đăng nhập
  };
}

// mode: "full" | "slow" | "error" | "save-error"
export async function getMockProfileRaw(mode: string) {
  await delay(mode === "slow" ? 3000 : DELAY);
  if (mode === "error") throw new Error("Mock: lỗi tải hồ sơ");
  return { ...readState() };
}

export async function mockUpdateProfile(
  mode: string,
  payload: UpdateProfilePayload
): Promise<void> {
  await delay(700);
  if (mode === "save-error") throw new Error("Mock: lỗi lưu hồ sơ");

  const next: ProfileData = {
    ...readState(),
    name: payload.name,
    language: payload.language,
  };

  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
  } catch {
    // bỏ qua nếu trình duyệt chặn localStorage
  }
}