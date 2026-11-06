# Hướng dẫn nối Frontend với API xác thực

Dành cho: Frontend Developer
Backend liên quan: `POST /api/auth/{register,login,refresh,logout}`, `GET /api/auth/me`, `GET|PATCH /api/users/me`
Tài liệu API đầy đủ: chạy backend rồi mở `http://localhost:3001/api/docs`

---

## Tình trạng hiện tại

`useAuth.ts` đang gọi `loginMock` / `registerMock`, chưa gọi API thật lần nào. Phần dựng giao
diện và xử lý trạng thái đã tốt — tài liệu này chỉ thay lớp dữ liệu bên dưới.

Có 6 điểm tên gọi đang lệch với API thật, và 3 vấn đề kiến trúc cần thêm mới.

---

## Bước 0 — Biến môi trường

Tạo `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

Backend chạy cổng **3001**, frontend giữ **3000**. Tiền tố `NEXT_PUBLIC_` là bắt buộc để
biến đọc được từ phía trình duyệt.

Nhớ thêm `.env.local` vào `.gitignore` (Next.js thường đã có sẵn) và tạo `.env.example`
tương ứng cho đồng đội.

---

## Bước 1 — Sửa `features/auth/types/auth_types.ts`

```ts
export type CefrLevel = "A1" | "A2" | "B1" | "B2";
export type UserRole = "USER" | "ADMIN";

export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: UserRole;
}

/** Trả về từ GET /api/users/me — có thêm cài đặt học tập */
export interface UserProfile extends User {
  level: CefrLevel;
  newWordsPerDay: number;
  maxReviewsPerDay: number;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export type AuthErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "EMAIL_ALREADY_EXISTS"
  | "NETWORK_ERROR"
  | "UNKNOWN";

/** Lỗi gắn với một ô nhập cụ thể, lấy từ mảng `errors` của response 400 */
export interface FieldError {
  field: string;
  message: string;
}

export class AuthError extends Error {
  code: AuthErrorCode;
  fieldErrors: FieldError[];

  constructor(
    code: AuthErrorCode,
    message: string,
    fieldErrors: FieldError[] = [],
  ) {
    super(message);
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  /** Lấy thông báo lỗi của một ô, dùng trực tiếp trong form */
  messageFor(field: string): string | undefined {
    return this.fieldErrors.find((e) => e.field === field)?.message;
  }
}
```

### Đã đổi những gì

| Cũ | Mới | Vì sao |
|---|---|---|
| `user.name` | `user.fullName` | Khớp cột `full_name` trong database và ô "Full Name" trên Figma |
| `res.token` | `res.accessToken` | Backend còn có refresh token, phải phân biệt rõ |
| `RegisterPayload.name` | `.fullName` + thêm `confirmPassword` | Backend kiểm tra hai mật khẩu khớp nhau ở server, không chỉ tin frontend |
| — | thêm `avatarUrl`, `role` | `UserMenu` và phân quyền sau này cần |
| `WEAK_PASSWORD` | `VALIDATION_ERROR` | Backend trả 400 cho mọi lỗi dữ liệu, không riêng mật khẩu |

**Mật khẩu tối thiểu 8 ký tự**, không phải 6. Sửa lại validate trong `RegisterForm`
cho khớp, nếu không form báo hợp lệ mà backend từ chối.

---

## Bước 2 — Tạo `features/auth/api/client.ts`

Đây là phần quan trọng nhất và cũng là phần chưa có. Nó lo hai việc: gắn token vào mỗi
request, và **tự làm mới token khi hết hạn**.

```ts
import { AuthError, AuthErrorCode, AuthResponse } from "../types/auth_types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// Access token giữ trong bộ nhớ, KHÔNG lưu localStorage — xem giải thích bên dưới
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

// Chỉ cho phép một lần refresh chạy tại một thời điểm
let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      accessToken = null;
      return null;
    }
    const data = (await res.json()) as AuthResponse;
    accessToken = data.accessToken;
    return data.accessToken;
  } catch {
    accessToken = null;
    return null;
  }
}

function refreshAccessToken(): Promise<string | null> {
  refreshPromise ??= doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

interface ErrorBody {
  message?: string;
  errors?: Array<{ path?: unknown[]; message?: string }>;
}

async function toAuthError(res: Response): Promise<AuthError> {
  let message = "Đã có lỗi xảy ra, vui lòng thử lại.";
  let fieldErrors: FieldError[] = [];

  try {
    const body = (await res.json()) as ErrorBody;

    if (Array.isArray(body.errors) && body.errors.length > 0) {
      // Lỗi 400 từ Zod: thông báo thật nằm trong errors[], không phải message
      fieldErrors = body.errors.map((e) => ({
        field: Array.isArray(e.path) ? String(e.path[0] ?? "") : "",
        message: e.message ?? "Giá trị không hợp lệ",
      }));
      message = fieldErrors[0].message;
    } else if (typeof body.message === "string") {
      message = body.message;
    }
  } catch {
    // body không phải JSON, giữ thông báo mặc định
  }

  const codeByStatus: Record<number, AuthErrorCode> = {
    400: "VALIDATION_ERROR",
    401: "INVALID_CREDENTIALS",
    409: "EMAIL_ALREADY_EXISTS",
  };

  return new AuthError(
    codeByStatus[res.status] ?? "UNKNOWN",
    message,
    fieldErrors,
  );
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const call = (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });

  let res: Response;
  try {
    res = await call(accessToken);
  } catch {
    throw new AuthError("NETWORK_ERROR", "Không thể kết nối tới máy chủ.");
  }

  // Token hết hạn → xin token mới rồi thử lại đúng một lần
  if (res.status === 401 && !path.startsWith("/auth/refresh")) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await call(newToken);
    }
  }

  if (!res.ok) throw await toAuthError(res);
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}
```

### Ba quyết định cần hiểu

**`credentials: "include"` ở mọi request.** Không có cờ này, trình duyệt **không gửi cookie**
sang cổng 3001 (khác origin với frontend ở 3000). Mà refresh token nằm trong httpOnly cookie,
nên thiếu nó là `/auth/refresh` luôn trả 401. Đây là lỗi số một khi nối API kiểu này.

**Access token giữ trong biến, không lưu `localStorage`.**

Nghe ngược đời — mất token khi tải lại trang thì sao? Không mất, vì refresh token nằm trong
cookie và cookie **sống qua reload**. Khi ứng dụng khởi động, gọi một lần `/auth/refresh`
là có access token mới ngay.

Lợi ích: token không nằm ở nơi mã JavaScript độc hại đọc được bằng
`localStorage.getItem()`. Đây chính là lý do backend chọn đặt refresh token vào httpOnly
cookie ngay từ đầu — lưu access token vào localStorage sẽ vứt bỏ toàn bộ lợi thế đó.

**Chống refresh trùng lặp bằng `refreshPromise`.** Nếu trang gọi 5 API cùng lúc và cả 5 đều
gặp 401, không có biến này thì sẽ có 5 lần gọi `/auth/refresh` song song. Backend **xoay
token mỗi lần refresh và thu hồi token cũ** — nên lần thứ hai trở đi sẽ dùng token đã bị thu
hồi, bị coi là dấu hiệu token bị đánh cắp, và **toàn bộ phiên của người dùng bị huỷ**.

Biến `refreshPromise` đảm bảo 5 request đó cùng chờ một lần refresh duy nhất. Bỏ nó đi là
sinh ra một lỗi cực khó tái hiện.

---

### Hình dạng lỗi 400 — đọc kỹ chỗ này

Backend dùng `nestjs-zod`, và response 400 luôn có dạng:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    { "path": ["password"], "message": "Mật khẩu phải có ít nhất 8 ký tự" },
    { "path": ["email"], "message": "Email không hợp lệ" }
  ]
}
```

**Trường `message` ở ngoài luôn là chuỗi tiếng Anh cố định `"Validation failed"`** — không
bao giờ đổi. Thông báo tiếng Việt thật nằm trong `errors[].message`, kèm `path[0]` là tên ô
bị lỗi. Đọc nhầm `message` là người dùng thấy "Validation failed" thay vì câu tiếng Việt.

Nhờ có `path`, form hiển thị được lỗi ngay dưới đúng ô:

```tsx
const { error } = useAuth();

<Input id="password" type="password" />
{error?.messageFor("password") && (
  <p className="text-sm text-red-500">{error.messageFor("password")}</p>
)}
```

Với lỗi `401` và `409` thì không có `errors`, `message` chính là câu tiếng Việt — hiển thị
chung ở đầu form là đủ.

---

## Bước 3 — Tạo `features/auth/api/auth_api.ts`

Thay `auth_mock.ts` (giữ file mock lại cũng được, để chạy giao diện khi backend chưa bật).

```ts
import { apiFetch, setAccessToken } from "./client";
import {
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  User,
  UserProfile,
} from "../types/auth_types";

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setAccessToken(data.accessToken);
  return data;
}

/** Đăng ký KHÔNG trả token — backend chỉ tạo tài khoản */
export async function register(payload: RegisterPayload): Promise<User> {
  return apiFetch<User>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logout(): Promise<void> {
  await apiFetch<void>("/auth/logout", { method: "POST" });
  setAccessToken(null);
}

export async function getProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/users/me");
}

export async function updateProfile(
  patch: Partial<
    Pick<
      UserProfile,
      "fullName" | "avatarUrl" | "level" | "newWordsPerDay" | "maxReviewsPerDay"
    >
  >,
): Promise<UserProfile> {
  return apiFetch<UserProfile>("/users/me", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
```

**Lưu ý về `register`:** khác với mock, nó **không trả token**. Backend cố ý tách đăng ký khỏi
đăng nhập. Sau khi đăng ký thành công có hai lựa chọn:

- Chuyển sang `/login` kèm thông báo "Đăng ký thành công, mời đăng nhập" — đơn giản, rõ ràng
- Hoặc tự gọi `login()` ngay bằng chính email/mật khẩu vừa nhập — mượt hơn cho người dùng

Chọn cách nào cũng được, nhưng phải chọn — không thể `persistSession(res.token)` như mock nữa.

**Lưu ý về `updateProfile`:** chỉ gửi trường muốn đổi. `newWordsPerDay` phải là **số**, không
phải chuỗi — ô `<input>` HTML luôn trả về chuỗi, phải `Number(value)` trước khi gửi, nếu
không backend trả 400.

---

## Bước 4 — Sửa `useAuth.ts`

```ts
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as authApi from "../api/auth_api";
import { AuthError, LoginPayload, RegisterPayload } from "../types/auth_types";

export function useAuth() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);

  async function run(fn: () => Promise<void>) {
    setIsLoading(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(
        err instanceof AuthError
          ? err
          : new AuthError("UNKNOWN", "Đã có lỗi xảy ra, vui lòng thử lại."),
      );
    } finally {
      setIsLoading(false);
    }
  }

  const login = (payload: LoginPayload) =>
    run(async () => {
      await authApi.login(payload);
      router.push("/dashboard");
      router.refresh();
    });

  const register = (payload: RegisterPayload) =>
    run(async () => {
      await authApi.register(payload);
      // Đăng ký xong tự đăng nhập luôn cho mượt
      await authApi.login({
        email: payload.email,
        password: payload.password,
      });
      router.push("/dashboard");
      router.refresh();
    });

  const logout = () =>
    run(async () => {
      await authApi.logout();
      router.push("/login");
      router.refresh();
    });

  return { login, register, logout, isLoading, error };
}
```

Bỏ hoàn toàn `localStorage.setItem` — không còn gì để lưu, vì cookie đã lo phần đó.

---

## Bước 5 — Thay `useCurrentUser` bằng một AuthProvider

Vấn đề của `useCurrentUser` hiện tại: nó chỉ đọc `localStorage` một lần, không bao giờ hỏi
lại server. Nên khi người dùng đổi tên ở trang cá nhân, Header vẫn hiện tên cũ. Và nếu token
hết hạn hay tài khoản bị khoá, frontend vẫn tưởng đang đăng nhập.

Nó còn gây **hydration mismatch**: đọc `localStorage` ngay trong hàm khởi tạo `useState` khiến
server render ra `null` còn client render ra user, React sẽ cảnh báo đỏ trong console.

Thay bằng một context dùng chung, tạo `features/auth/hooks/AuthProvider.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiFetch, setAccessToken } from "../api/client";
import { AuthResponse, UserProfile } from "../types/auth_types";

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  reload: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const profile = await apiFetch<UserProfile>("/users/me");
      setUser(profile);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Khi tải trang: xin access token mới từ refresh cookie, rồi lấy hồ sơ
    (async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
          { method: "POST", credentials: "include" },
        );
        if (res.ok) {
          const data = (await res.json()) as AuthResponse;
          setAccessToken(data.accessToken);
          await reload();
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [reload]);

  return (
    <AuthContext.Provider value={{ user, isLoading, reload }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useCurrentUser() {
  return useContext(AuthContext);
}
```

Bọc nó ở `app/layout.tsx`, bên trong `<body>`.

Đoạn `useEffect` này là **cơ chế khôi phục phiên**: người dùng đóng trình duyệt hôm qua, mở
lại hôm nay, cookie refresh vẫn còn hạn 7 ngày → tự đăng nhập lại, không cần nhập gì.

Sau khi người dùng lưu thay đổi ở trang cá nhân, gọi `reload()` để Header cập nhật ngay.

---

## Bước 6 — Chặn route chưa đăng nhập

Hiện gõ thẳng `localhost:3000/dashboard` là vào được dù chưa đăng nhập.

**Không dùng được Next.js middleware ở đây.** Middleware chạy trên server của Next (cổng 3000)
và chỉ đọc được cookie của chính origin đó. Refresh token lại là cookie của backend (cổng
3001, path `/api/auth`) — middleware hoàn toàn không nhìn thấy.

Nên chặn ở phía client, trong `app/(main)/layout.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/features/auth/hooks/AuthProvider";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  if (isLoading) return <div className="p-8">Đang tải…</div>;
  if (!user) return null;

  return <>{children}</>;
}
```

Điều kiện `!isLoading &&` rất quan trọng: thiếu nó, lần render đầu tiên `user` còn là `null`
(đang chờ refresh xong) và người dùng đã đăng nhập vẫn bị đá về `/login`.

Đây là chặn ở tầng giao diện, mang tính trải nghiệm. **Bảo mật thật nằm ở backend** — mọi
endpoint đã có `JwtAuthGuard`, không có token là 401 dù có vào được trang hay không.

---

## Thứ tự làm

1. Bước 0 và 1 — đổi tên trường, sửa validate mật khẩu thành 8 ký tự. Làm được ngay, chưa cần backend.
2. Bước 2 và 3 — lớp gọi API. Cần backend chạy để thử.
3. Bước 4 — nối `useAuth`, thử đăng ký và đăng nhập thật.
4. Bước 5 và 6 — khôi phục phiên và chặn route.

## Cách chạy backend để thử

```bash
cd backend
npm install
npx prisma migrate deploy
npm run start:dev
```

Cần PostgreSQL chạy sẵn và `backend/.env` (xem `.env.example`). Backend lên ở
`http://localhost:3001`, tài liệu API ở `http://localhost:3001/api/docs`.

Trên trang tài liệu, bấm **Authorize**, dán `accessToken` lấy từ `/auth/login` là thử được
mọi endpoint ngay trên trình duyệt.

## Ba lỗi hay gặp

**`/auth/refresh` luôn trả 401** → thiếu `credentials: "include"`, hoặc gọi sai cổng.

**Đăng nhập được nhưng 15 phút sau bị đá ra** → phần tự refresh trong `apiFetch` chưa chạy.
Mở tab Network xem có request tới `/auth/refresh` không.

**Đang dùng thì đột nhiên bị đăng xuất hẳn** → nhiều lần refresh chạy song song. Kiểm tra
biến `refreshPromise` đã đúng chưa. Backend coi việc dùng lại token đã thu hồi là dấu hiệu
bị đánh cắp và huỷ toàn bộ phiên.
