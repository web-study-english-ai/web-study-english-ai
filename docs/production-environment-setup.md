# Tài Liệu Thiết Lập & Bàn Giao Môi Trường Chạy Thật - Production (WSEA-96)

> **Mục tiêu:** Thiết lập môi trường Production độc lập hoàn toàn với môi trường Staging (Kiểm thử), cấu hình cơ chế tự động triển khai (Continuous Deployment) từ nhánh **`main`**, tách biệt cơ sở dữ liệu và bảo đảm an toàn dữ liệu người dùng thực tế.

---

## 1. Sơ Đồ Kiến Trúc Hệ Thống Production

```text
               Người Dùng / Trình Duyệt (Web Browser)
                               │
            ┌──────────────────┴──────────────────┐
            ▼ (HTTPS / DNS)                       ▼ (API Requests / JWT Cookie)
┌──────────────────────────────────────┐     ┌─────────────────────────────────────────┐
│         Frontend Production          │     │           Backend Production            │
│  • Nền tảng: Vercel                  │────►│  • Nền tảng: Render Web Service         │
│  • Nhánh: main (Auto-deploy)         │     │  • Nhánh: main (Auto-deploy)            │
│  • URL: web-study-english-ai.        │     │  • URL: web-study-english-ai-prod.      │
│         vercel.app                   │     │         onrender.com                    │
└──────────────────────────────────────┘     └────────────────────┬────────────────────┘
                                                                  │ (Internal / SSL Connection)
                                                                  ▼
                                             ┌─────────────────────────────────────────┐
                                             │      Database PostgreSQL Production     │
                                             │  • Nền tảng: Render PostgreSQL (SG)     │
                                             │  • DB: study_english_prod               │
                                             │  • Tách biệt 100% với Staging DB        │
                                             │  • Dữ liệu: 22 Topics & 2,000 Từ gốc    │
                                             └─────────────────────────────────────────┘
```

---

## 2. Bảng Checklist Biến Môi Trường (Environment Variables)

### 2.1. Backend Production (Cấu hình trên Render Dashboard)

Vào **Render Dashboard** ➔ Chọn Web Service `web-study-english-ai-prod` ➔ **Environment**:

| Tên biến (Key)                   | Giá trị Production (Value)                                                                           | Mục đích / Ràng buộc kỹ thuật                                        |
| :------------------------------- | :--------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------- |
| `NODE_ENV`                       | `production`                                                                                         | Bật chế độ tối ưu hóa Production của NestJS & Node                   |
| `DATABASE_URL`                   | `postgresql://postgres_prod:***@dpg-dajbi7ojo6nc73d7amq0-a/study_english_prod?schema=public`         | Chuỗi kết nối nội bộ đến **Database PostgreSQL Production**          |
| `JWT_ACCESS_SECRET`              | `wsea_prod_jwt_secret_key_2026_super_secure_anti_leak`                                               | Khóa bí mật ký JWT riêng cho Production (không dùng lại key dev)     |
| `JWT_ACCESS_EXPIRES_IN`          | `900`                                                                                                | Thời hạn Access Token (15 phút = 900 giây)                           |
| `REFRESH_TOKEN_TTL_DAYS`         | `7`                                                                                                  | Thời hạn Refresh Token lưu trong DB (7 ngày)                         |
| `REFRESH_COOKIE_NAME`            | `wsea_rt_prod`                                                                                       | Đặt tên cookie riêng để không bị đè với cookie Staging               |
| `COOKIE_SECURE`                  | `true`                                                                                               | **Bắt buộc:** Chỉ truyền cookie qua giao thức bảo mật HTTPS          |
| `COOKIE_SAMESITE`                | `none`                                                                                               | **Bắt buộc:** Cho phép truyền cookie xuyên site giữa Vercel & Render |
| `COOKIE_DOMAIN`                  | _(Để trống)_                                                                                         | Để trống khi Frontend và Backend nằm ở hai domain khác nhau          |
| `CORS_ORIGIN`                    | `https://web-study-english-ai.vercel.app`                                                            | Cho phép duy nhất Frontend Production gọi API (chặn CSRF)            |
| `FRONTEND_URL`                   | `https://web-study-english-ai.vercel.app`                                                            | Điểm đến chuyển hướng (redirect) sau khi xác thực OAuth              |
| `DICTIONARY_API_URL`             | `https://www.dictionaryapi.com/api/v3/references/learners/json`                                      | Endpoint tra từ điển của Merriam-Webster                             |
| `DICTIONARY_API_KEY`             | _(Khóa API từ điển)_                                                                                 | Khóa xác thực dịch vụ từ điển                                        |
| `DICTIONARY_TIMEOUT_MS`          | `3000`                                                                                               | Thời gian timeout khi tra cứu từ (3 giây)                            |
| `DICTIONARY_NEGATIVE_CACHE_DAYS` | `7`                                                                                                  | Lưu cache các từ không tìm thấy (7 ngày)                             |
| `SENTRY_DSN`                     | `https://66a6f849e9b85408cf99ba3cfaaf74a3@o4512043886575616.ingest.us.sentry.io/4512043921768448`    | Giám sát lỗi và cảnh báo sự cố thời gian thực qua Sentry             |

---

### 2.2. Frontend Production (Cấu hình trên Vercel Dashboard)

Vào **Vercel Dashboard** ➔ Chọn Project `web-study-english-ai` ➔ **Settings** ➔ **Environments** ➔ **Production**:

| Tên biến (Key)           | Giá trị Production (Value)                                                                           | Ghi chú                                     |
| :----------------------- | :--------------------------------------------------------------------------------------------------- | :------------------------------------------ |
| `NEXT_PUBLIC_API_URL`    | `https://web-study-english-ai-prod.onrender.com/api`                                                 | Trỏ trực tiếp về API Backend Production     |
| `NEXT_PUBLIC_SENTRY_DSN` | `https://b2f6043a2421f0b192056b62912fc411@o4512043886575616.ingest.us.sentry.io/4512043907743744`    | DSN giám sát lỗi phía giao diện trình duyệt |

---

## 3. Quy Trình Triển Khai Thực Tế Đã Hoàn Thành

### Bước 1: Database PostgreSQL Production Riêng
- **Nền tảng:** Render PostgreSQL (Singapore).
- **Service Name:** `wsea-postgres-prod` (Database: `study_english_prod`).
- **Trạng thái:** Hoạt động ổn định, kết nối nội bộ Private Network độ trễ thấp (~3ms - 46ms).

### Bước 2: Web Service Backend Production trên Render
- **Service Name:** `web-study-english-ai-prod`
- **Branch:** `main` (Continuous Deployment từ commit mới nhất).
- **Root Directory:** `backend`
- **Build Command:** `npm install --include=dev && npm run build`
- **Start Command:** `npm run start:prod`
- **Primary URL:** `https://web-study-english-ai-prod.onrender.com`

### Bước 3: Nạp Cấu Trúc Bảng & Học Liệu Ban Đầu (Data Migration & Seeding)
- Đã chạy thành công 6 bản migration:
  ```bash
  npx prisma migrate deploy
  ```
- Đã nạp thành công 100% học liệu sạch (thời gian: 104.39s):
  ```bash
  npm run seed
  ```
  - **22 chủ đề (Topics)**
  - **2,000 từ vựng gốc** (500 từ A1, 500 từ A2, 500 từ B1, 500 từ B2)
  - 0 từ lỗi, 0 mock user (bảo đảm môi trường Production nguyên bản).

### Bước 4: Thiết lập Frontend Production trên Vercel
- **Project:** `web-study-english-ai`
- **Production Branch:** `main`
- **Production Domain:** `https://web-study-english-ai.vercel.app`
- **Trạng thái:** `Ready Latest`, build thành công với biến `NEXT_PUBLIC_API_URL`.

---

## 4. Kịch Bản Kiểm Thử Sau Triển Khai (Smoke Test Checklist)

| STT | Kịch bản kiểm thử                | Thao tác thực hiện                                                  | Kết quả thực tế                                                                              | Trạng thái |
| :-: | :------------------------------- | :------------------------------------------------------------------ | :------------------------------------------------------------------------------------------- | :--------: |
|  1  | **Kiểm tra Sức khỏe Hệ thống**   | `GET https://web-study-english-ai-prod.onrender.com/health`          | Trả về HTTP 200: `status: ok`, `environment: production`, `database.status: up`, latency 3ms |  [x] Đạt   |
|  2  | **Tài liệu API (Swagger)**       | Truy cập `https://web-study-english-ai-prod.onrender.com/api/docs`  | Giao diện Swagger UI hiển thị đầy đủ tài liệu API, bảo mật JWT Bearer Auth                   |  [x] Đạt   |
|  3  | **Đăng ký Tài khoản Người Dùng** | Tạo tài khoản người dùng thực tế trên web Production                | Đăng ký thành công, mã hóa mật khẩu bcrypt muối 12 chuẩn, ghi nhận User #1 trong DB          |  [x] Đạt   |
|  4  | **Đăng nhập & Quản lý Phiên**    | Đăng nhập tài khoản vừa tạo tại `/login`                            | Nhận JWT Access Token, Cookie Refresh `wsea_rt_prod` lưu `Secure; SameSite=None`             |  [x] Đạt   |
|  5  | **Học liệu & Danh mục Từ**       | Mở trang Quản lý từ vựng (`/vocabulary`)                            | Hiển thị đầy đủ 22 chủ đề, phân trang chuẩn 20 từ/trang, tìm kiếm & lọc cấp độ CEFR mượt mà |  [x] Đạt   |
|  6  | **Bảo mật CORS Xuyên Miền**      | Gọi API từ `https://web-study-english-ai.vercel.app` về Render      | Phản hồi `access-control-allow-origin: https://web-study-english-ai.vercel.app`, không lỗi   |  [x] Đạt   |
