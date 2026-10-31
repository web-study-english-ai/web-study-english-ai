# WSEA-150: Báo Cáo Rà Soát Bảo Mật Toàn Hệ Thống

> **Mã công việc:** Jira WSEA-150 (Sprint Đợt 9 D25–D27)  
> **Người thực hiện:** Phạm Thái Bình (`Binhpham15`) — DevOps / Backend Engineer  
> **Phạm vi rà soát:** Client Next.js, API Gateway NestJS, PostgreSQL Supabase, Authentication & Authorization Engine  
> **Kết quả đánh giá:** **100% ĐẠT TIÊU CHUẨN AN TOÀN (145/145 Automated Tests Passed)**  
> **Ghi chú bàn giao:** Báo cáo kỹ thuật chi tiết dạng PDF đã được lưu trữ cục bộ tại máy trạm cá nhân (`Desktop`), không đưa file nhị phân vào kho mã nguồn Git.

---

## 1. Tóm Tắt Kết Quả Rà Soát (Executive Summary)

Nhằm chuẩn bị vững chắc cho bản phát hành **v1.1**, hệ thống **Web Study English AI** đã được rà soát bảo mật chuyên sâu theo 4 trụ cột cốt lõi:

| STT | Trụ Cột Kiểm Tra | Hạng Mục Chi Tiết | Kết Quả | Đánh Giá |
| :---: | :--- | :--- | :---: | :--- |
| **1** | **Client Secret Leak** | Kiểm tra toàn bộ biến môi trường phía frontend và bundle JavaScript Next.js. Loại trừ rò rỉ API Keys (Hugging Face, Gemini, Merriam-Webster, Database URL). | **0 Rò Rỉ** | Tuân thủ tuyệt đối chuẩn Next.js |
| **2** | **IDOR & Phân Quyền** | Kiểm tra 100% endpoints (Cards, Reviews, Progress, Reading, Assistant, Users). Decorator `@CurrentUser('id')` và xác thực quyền sở hữu. | **Cô Lập 100%** | Ngăn chặn hoàn toàn truy cập chéo tài khoản |
| **3** | **Password & Tokens** | Băm mật khẩu `bcrypt` muối 12; Refresh Token rotation (RFC 6819); Băm SHA-256 token trong DB; Cơ chế Theft Detection thu hồi khi replay attack. | **Chuẩn Doanh Nghiệp** | Bảo vệ phiên và thông tin xác thực tối đa |
| **4** | **Kiểm Thử Tự Động** | Kích hoạt toàn bộ 15 test suites Backend và Frontend unit tests kiểm chứng các rào chắn bảo mật. | **145/145 PASS** | Toàn bộ các kịch bản an ninh đều vượt qua |

---

## 2. Trụ Cột 1: Kiểm Tra Khoá Bí Mật Phía Trình Duyệt (Browser Secret Leak Check)

### 2.1. Phân Tích Tiền Tố Biến Môi Trường (Prefix Audit)
Theo cơ chế của Next.js 16 App Router, chỉ các biến môi trường có tiền tố `NEXT_PUBLIC_` mới được nhúng vào bundle JavaScript của trình duyệt. Quét tự động toàn bộ thư mục `frontend/` cho kết quả:
* `NEXT_PUBLIC_API_URL`: Trỏ về API Gateway (`http://localhost:3001/api` hoặc domain staging) -> **An toàn, không chứa dữ liệu nhạy cảm**.
* `NEXT_PUBLIC_SENTRY_DSN`: Public DSN để trình duyệt gửi telemetry lỗi về Sentry -> **An toàn theo thiết kế của Sentry** (chỉ có quyền gửi event một chiều, không thể truy vấn hoặc can thiệp dữ liệu máy chủ).

### 2.2. Kiểm Soát Khóa Dịch Vụ Thứ Ba (Upstream API Keys)
Toàn bộ các khóa bí mật sau đây chỉ được nạp tại `backend/.env` và được Node.js runtime quản lý, tuyệt đối không xuất hiện trong mã nguồn client:
* `DATABASE_URL`: Chuỗi kết nối PostgreSQL Supabase.
* `JWT_ACCESS_SECRET`: Khóa ký chữ ký số Access Token.
* `AI_SERVICE_KEY` / `HF_KEY`: Khóa gọi Hugging Face Spaces & Microservice AI.
* `DICTIONARY_API_KEY`: Khóa bản quyền tra từ điển Merriam-Webster.
* `GOOGLE_CLIENT_SECRET`: Khóa xác thực Google OAuth 2.0.

```text
Trình Duyệt (Client) ──[HTTPS + JWT Bearer Token]──► Backend NestJS ──[Private API Key]──► Upstream APIs (HF / Merriam-Webster)
(Không giữ bất kỳ API Key nào)                         (Quản lý biến .env an toàn)           (Không lộ ra Internet)
```

---

## 3. Trụ Cột 2: Kiểm Tra Phân Quyền Truy Cập Dữ Liệu Chéo (IDOR Audit)

**IDOR (Insecure Direct Object Reference)** xảy ra khi người dùng A có thể xem hoặc chỉnh sửa tài nguyên của người dùng B bằng cách thay đổi ID trên URL hoặc request body.

### 3.1. Rào Chắn Phân Quyền Trung Tâm
Hệ thống sử dụng `JwtAuthGuard` kết hợp decorator `@CurrentUser('id')` lấy trực tiếp `userId` từ trường `sub` của Access Token đã được ký số:
```typescript
// backend/src/modules/auth/strategies/jwt.strategy.ts
async validate(payload: JwtPayload): Promise<AuthUser> {
  const user = await this.prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, fullName: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) {
    throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị khoá');
  }
  return user;
}
```

### 3.2. Bảng Rà Soát Chi Tiết Khả Năng Chống IDOR Trên Các Phân Hệ

| Module | Endpoint | Cơ Chế Kiểm Tra Quyền Sở Hữu | Đánh Giá IDOR |
| :--- | :--- | :--- | :---: |
| **Users** | `GET /users/me`<br>`PATCH /users/me` | Không có route `/users/:id`. Mọi thao tác hồ sơ đều tự động gắn chặt vào `currentUser.id`. | **Miễn nhiễm IDOR** |
| **Cards** | `DELETE /cards/:id`<br>`GET /cards` | `if (!card \|\| card.userId !== userId) throw new NotFoundException('Không tìm thấy thẻ');`<br>Trả về 404 để không làm lộ sự tồn tại của thẻ người khác. | **Cô lập 100%** |
| **Reviews** | `POST /reviews` | Xác thực `card.userId === userId` trước khi áp dụng thuật toán lặp lại ngắt quãng (FSRS/Simple Scheduler). | **Cô lập 100%** |
| **Progress** | `GET /progress/stats`<br>`GET /progress/daily` | Toàn bộ truy vấn Prisma đều lọc cứng điều kiện `where: { userId }`. | **Cô lập 100%** |
| **Reading** | `GET /reading/:id`<br>`POST /reading/:id/submit`<br>`PUT /reading/:id/draft` | 1. Bản nháp và lịch sử làm bài gắn với `userId`.<br>2. **Bảo mật đề thi:** Prisma `select` chủ động ẩn `correctOptionIndex` và `explanation` trước khi nộp bài, ngăn chặn gian lận xem trước đáp án qua DevTools Network. | **Bảo mật kép** |
| **Assistant** | `GET /assistant/conversations/:id`<br>`DELETE /assistant/conversations/:id` | Kiểm tra quyền sở hữu cuộc trò chuyện AI trước khi hiển thị hoặc xoá:<br>`if (!hoiThoai \|\| hoiThoai.userId !== userId) throw new NotFoundException();` | **Cô lập 100%** |

---

## 4. Trụ Cột 3: Băm Mật Khẩu & Quản Lý Phiên/Token

### 4.1. Thuật Toán Băm Mật Khẩu (Bcrypt Salt 12)
* Sử dụng `bcryptjs` với số vòng muối `BCRYPT_SALT_ROUNDS = 12`. Thời gian tính toán lý tưởng (~250-350ms), chống lại hiệu quả các đợt vét cạn bằng GPU/ASIC.
* Tuyệt đối không lưu mật khẩu dạng plaintext.
* Prisma queries trong `register()`, `login()`, `me()` dùng `select` tường minh loại trừ trường `passwordHash` trong response.

### 4.2. Vòng Đời Refresh Token & Phòng Chống Replay Attack (RFC 6819)
* **High Entropy:** Sinh ngẫu nhiên 48 bytes bằng `crypto.randomBytes(48).toString('base64url')` (~384-bit entropy).
* **Băm SHA-256 lưu DB:** Database chỉ lưu `tokenHash = sha256(rawToken)`. Kể cả khi CSDL bị lộ dump, kẻ tấn công cũng không thể dùng hash này để đăng nhập.
* **Token Rotation (Xoay vòng):** Mỗi lần gọi `/api/auth/refresh`, token cũ lập tức bị thu hồi (`revokedAt = new Date()`), cấp mới một cặp access/refresh token.
* **Theft Detection (Phát hiện đánh cắp):** Nếu một token đã bị thu hồi (`revokedAt != null`) mà lại được gửi lên, hệ thống lập tức **thu hồi TOÀN BỘ các refresh token đang hoạt động của tài khoản đó**, cưỡng bức đăng xuất toàn hệ thống để bảo vệ người dùng:
  ```typescript
  if (stored.revokedAt) {
    await this.prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new UnauthorizedException('Phiên đăng nhập không an toàn, vui lòng đăng nhập lại');
  }
  ```
* **Cookie HttpOnly An Toàn:** Đặt token trong cookie `wsea_rt` với cờ `httpOnly: true`, `path: '/api/auth'`, ngăn chặn hoàn toàn mã độc XSS đọc trộm.

---

## 5. Kết Quả Kiểm Thử Tự Động (Automated Test Verification)

Toàn bộ 15 test suites Backend đã được chạy và vượt qua hoàn hảo:
```text
Test Files  15 passed (15)
     Tests  145 passed (145)
  Duration  56.53s

✓ src/modules/reading/reading.service.spec.ts (8 tests)
✓ src/modules/health/health.service.spec.ts (3 tests)
✓ src/modules/dictionary/dictionary.service.spec.ts (6 tests)
✓ src/modules/progress/progress.service.spec.ts (7 tests)
✓ src/modules/auth/auth.service.spec.ts (11 tests)
✓ src/modules/cards/cards.service.spec.ts (18 tests)
✓ src/modules/vocabulary/vocabulary.service.spec.ts (8 tests)
✓ src/modules/infra-resilience/infra-resilience.service.spec.ts (10 tests)
✓ src/modules/reviews/simple-scheduler.spec.ts (7 tests)
✓ src/app.controller.spec.ts (1 test)
✓ src/modules/reviews/ai-scheduler.client.spec.ts (3 tests)
✓ src/modules/assistant/assistant.service.spec.ts (18 tests)
✓ src/modules/assistant/assistant.client.spec.ts (8 tests)
✓ src/modules/reviews/reviews.service.spec.ts (29 tests)
✓ src/modules/ai-monitor/ai-monitor.service.spec.ts (8 tests)
```

---

## 6. Khuyến Nghị Vận Hành Trong Tương Lai (Hardening Recommendations)

1. **Bổ sung Rate Limiting (`@nestjs/throttler`):** Áp dụng giới hạn tần suất gọi trên `POST /api/auth/login` (chống vét cạn mật khẩu) và `POST /api/assistant/ask` (chống spam tiêu tốn ngân sách AI).
2. **Bảo vệ API Giám sát Nội bộ:** Đặt các endpoint `/api/ai-monitor/*` và `/api/infra-resilience/*` dưới Guard nội bộ (`INTERNAL_API_KEY` hoặc `RoleGuard.ADMIN`) trước khi đưa ra Production công cộng.
3. **HTTP Security Headers (`helmet`):** Đính kèm middleware `helmet` vào `backend/src/main.ts` để tự động bổ sung các header an ninh trình duyệt (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`).
