# Tài Liệu Thiết Lập & Bàn Giao Môi Trường Chạy Thật - Production (WSEA-96)

> **Mục tiêu:** Thiết lập môi trường Production độc lập hoàn toàn với môi trường Staging (Kiểm thử), cấu hình cơ chế tự động triển khai (Continuous Deployment) từ nhánh **`main`**, tách biệt cơ sở dữ liệu và bảo đảm an toàn dữ liệu người dùng thực tế.

---

## 1. Sơ Đồ Kiến Trúc Hệ Thống Production

```text
               Người Dùng / Trình Duyệt (Web Browser)
                               │
            ┌──────────────────┴──────────────────┐
            ▼ (HTTPS / DNS)                       ▼ (API Requests / JWT Cookie)
┌───────────────────────────────┐     ┌───────────────────────────────────┐
│     Frontend Production       │     │        Backend Production         │
│  • Nền tảng: Vercel           │────►│  • Nền tảng: Render Web Service   │
│  • Nhánh: main (Auto-deploy)  │     │  • Nhánh: main (Auto-deploy)      │
│  • URL: *.vercel.app          │     │  • URL: *.onrender.com            │
└───────────────────────────────┘     └─────────────────┬─────────────────┘
                                                        │ (Internal / SSL Connection)
                                                        ▼
                                      ┌───────────────────────────────────┐
                                      │   Database PostgreSQL Production  │
                                      │  • Tách biệt 100% với Staging DB  │
                                      │  • PostgreSQL 16+ / pgvector      │
                                      │  • Dữ liệu: 22 Topics & 2,000 Từ  │
                                      └───────────────────────────────────┘
```

---

## 2. Bảng Checklist Biến Môi Trường (Environment Variables)

### 2.1. Backend Production (Cấu hình trên Render Dashboard)

Vào **Render Dashboard** ➔ Chọn Web Service Production ➔ **Environment**:

| Tên biến (Key)                   | Giá trị Production (Value)                                                                        | Mục đích / Ràng buộc kỹ thuật                                        |
| :------------------------------- | :------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------- |
| `NODE_ENV`                       | `production`                                                                                      | Bật chế độ tối ưu hóa Production của NestJS & Node                   |
| `DATABASE_URL`                   | `postgresql://...`                                                                                | Chuỗi kết nối đến **Database PostgreSQL Production riêng biệt**      |
| `JWT_ACCESS_SECRET`              | _(Chuỗi ngẫu nhiên 32+ ký tự)_                                                                    | Khóa bí mật ký JWT riêng cho Production (không dùng lại key dev)     |
| `JWT_ACCESS_EXPIRES_IN`          | `900`                                                                                             | Thời hạn Access Token (15 phút = 900 giây)                           |
| `REFRESH_TOKEN_TTL_DAYS`         | `7`                                                                                               | Thời hạn Refresh Token lưu trong DB (7 ngày)                         |
| `REFRESH_COOKIE_NAME`            | `wsea_rt_prod`                                                                                    | Đặt tên cookie riêng để không bị đè với cookie Staging               |
| `COOKIE_SECURE`                  | `true`                                                                                            | **Bắt buộc:** Chỉ truyền cookie qua giao thức bảo mật HTTPS          |
| `COOKIE_SAMESITE`                | `none`                                                                                            | **Bắt buộc:** Cho phép truyền cookie xuyên site giữa Vercel & Render |
| `COOKIE_DOMAIN`                  | _(Để trống)_                                                                                      | Để trống khi Frontend và Backend nằm ở hai domain khác nhau          |
| `CORS_ORIGIN`                    | `https://<frontend-prod>.vercel.app`                                                              | Cho phép duy nhất Frontend Production gọi API (chặn CSRF)            |
| `FRONTEND_URL`                   | `https://<frontend-prod>.vercel.app`                                                              | Điểm đến chuyển hướng (redirect) sau khi xác thực OAuth              |
| `DICTIONARY_API_URL`             | `https://www.dictionaryapi.com/api/v3/references/learners/json`                                   | Endpoint tra từ điển của Merriam-Webster                             |
| `DICTIONARY_API_KEY`             | _(Khóa API từ điển)_                                                                              | Khóa xác thực dịch vụ từ điển                                        |
| `DICTIONARY_TIMEOUT_MS`          | `3000`                                                                                            | Thời gian timeout khi tra cứu từ (3 giây)                            |
| `DICTIONARY_NEGATIVE_CACHE_DAYS` | `7`                                                                                               | Lưu cache các từ không tìm thấy (7 ngày)                             |
| `SENTRY_DSN`                     | `https://66a6f849e9b85408cf99ba3cfaaf74a3@o4512043886575616.ingest.us.sentry.io/4512043921768448` | Giám sát lỗi và cảnh báo sự cố thời gian thực qua Sentry             |

---

### 2.2. Frontend Production (Cấu hình trên Vercel Dashboard)

Vào **Vercel Dashboard** ➔ Chọn Project ➔ **Settings** ➔ **Environment Variables** (Chọn phạm vi **Production**):

| Tên biến (Key)           | Giá trị Production (Value)                | Ghi chú                                     |
| :----------------------- | :---------------------------------------- | :------------------------------------------ |
| `NEXT_PUBLIC_API_URL`    | `https://<backend-prod>.onrender.com/api` | Trỏ trực tiếp về API Backend Production     |
| `NEXT_PUBLIC_SENTRY_DSN` | `https://...`                             | DSN giám sát lỗi phía giao diện trình duyệt |

---

## 3. Quy Trình 4 Bước Triển Khai Thực Tế

### Bước 1: Tạo Database PostgreSQL Production Riêng

1. Trên **Render** (hoặc Supabase / Neon): Chọn **New PostgreSQL**.
2. **Name:** `wsea-postgres-prod`
3. **Database:** `study_english_prod`
4. **Region:** `Singapore` (để đồng vị trí với Web Service, tối ưu độ trễ).
5. Lưu lại `Internal Database URL` để kết nối nội bộ siêu tốc.

### Bước 2: Tạo Web Service Backend Production trên Render

1. Nhấn **New +** ➔ Chọn **Web Service** ➔ Kết nối repo `web-study-english-ai`.
2. **Branch:** Chọn **`main`** _(Đáp ứng tiêu chí auto-deploy từ nhánh main)_.
3. **Root Directory:** `backend`
4. **Build Command:** `npm run build`
5. **Start Command:** `npm run start:prod`
6. Nhập đầy đủ các biến môi trường theo **Bảng 2.1** ở trên.

### Bước 3: Nạp Cấu Trúc Bảng & Học Liệu Ban Đầu (Data Migration & Seeding)

Sau khi Backend Production khởi động, thực thi migration và nạp 22 chủ đề cùng 2,000 từ vựng gốc vào cơ sở dữ liệu mới:

```bash
# 1. Chạy migration an toàn không reset bảng
npx prisma migrate deploy

# 2. Nạp 22 chủ đề và 2,000 từ vựng gốc (từ file vocab_2000.csv)
npm run seed
```

> ⚠️ **Lưu ý quan trọng:** Tuyệt đối **KHÔNG CHẠY** `npm run seed:mock` trên môi trường Production vì đó là dữ liệu thử nghiệm của Tester.

### Bước 4: Thiết lập Frontend Production trên Vercel

1. Vào project Vercel hiện tại ➔ **Settings** ➔ **Git** ➔ Cấu hình **Production Branch** là **`main`**.
2. Vào **Settings** ➔ **Environment Variables** ➔ Kiểm tra biến `NEXT_PUBLIC_API_URL` trỏ đúng về backend production.
3. Khi merge code vào nhánh `main`, Vercel sẽ tự động kích hoạt lượt build production mới.

---

## 4. Kịch Bản Kiểm Thử Sau Triển Khai (Smoke Test Checklist)

| STT | Kịch bản kiểm thử                | Thao tác thực hiện                                   | Kết quả kỳ vọng                                                                            | Trạng thái |
| :-: | :------------------------------- | :--------------------------------------------------- | :----------------------------------------------------------------------------------------- | :--------: |
|  1  | **Kiểm tra Sức khỏe Hệ thống**   | Truy cập `https://<backend-prod>/health`             | Trả về `status: ok`, `environment: production`, database latency < 20ms                    |    [ ]     |
|  2  | **Tài liệu API (Swagger)**       | Truy cập `https://<backend-prod>/api/docs`           | Hiển thị đầy đủ danh sách endpoints xác thực, từ vựng, thẻ học, reviews                    |    [ ]     |
|  3  | **Đăng ký Tài khoản Người Dùng** | Tạo tài khoản mới trên giao diện Frontend Production | Đăng ký thành công, mật khẩu mã hóa bcrypt chuẩn, trả về mã HTTP 201                       |    [ ]     |
|  4  | **Đăng nhập & Quản lý Phiên**    | Đăng nhập tài khoản vừa tạo                          | Trả về Access Token, Cookie `wsea_rt_prod` được lưu với thuộc tính `Secure; SameSite=None` |    [ ]     |
|  5  | **Học liệu & Danh mục Từ**       | Mở trang Từ vựng / Chủ đề                            | Hiển thị đủ 22 chủ đề và danh sách 2,000 từ vựng chuẩn không bị lỗi trống dữ liệu          |    [ ]     |
|  6  | **Giám sát Lỗi Sentry**          | Gửi thử request test `/health/sentry-test`           | Sự cố được ghi nhận tức thì trên Dashboard của Sentry                                      |    [ ]     |
