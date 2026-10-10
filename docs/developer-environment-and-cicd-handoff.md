# TÀI LIỆU BÀN GIAO MÔI TRƯỜNG PHÁT TRIỂN & QUY TRÌNH CI/CD
## (Developer Environment & CI/CD Operations Handoff Guide)

* **Dự án:** Web Study English AI (`web-study-english-ai`)
* **Người biên soạn:** Phạm Thái Bình (DevOps Engineer)
* **Đối tượng tiếp nhận:** Frontend Team, Backend Team, AI Team, QA/Tester
* **Phiên bản:** v1.0 - Chuẩn bàn giao kỹ thuật doanh nghiệp
* **Ngày phát hành:** 29/09/2026

---

## 1. TỔNG QUAN VÀ MA TRẬN MÔI TRƯỜNG (ENVIRONMENT MATRIX)

Dự án áp dụng mô hình phân tách 3 môi trường tiêu chuẩn công nghiệp nhằm đảm bảo an toàn dữ liệu, tính ổn định và kiểm thử độc lập:

| Thông số / Môi trường | 💻 Local Development | 🧪 Staging (Kiểm thử) | 🚀 Production (Thực tế) |
| :--- | :--- | :--- | :--- |
| **Mục đích** | Phát triển tính năng mới, debug nhanh | Tích hợp code sau merge, QA/Tester kiểm thử | Người dùng thực tế truy cập |
| **Nhánh Git tương ứng** | `feature/*`, `fix/*` | `develop` | `main` |
| **Frontend URL** | `http://localhost:3000` | Render Web Service (Staging) | Render Web Service (Prod) |
| **Backend API URL** | `http://localhost:3001` | `https://web-study-english-ai.onrender.com` | `https://web-study-english-ai-prod.onrender.com` |
| **AI Service URL** | `http://localhost:7860` | Hugging Face Spaces / Render AI | Hugging Face Spaces / Render AI Prod |
| **Hệ quản trị CSDL** | **PostgreSQL 17** (Chạy Docker cục bộ) | **PostgreSQL (Supabase Managed)** | **PostgreSQL (Supabase Managed)** |
| **Database Host** | `localhost:5432` | `aws-0-ap-southeast-1.pooler.supabase.com` | `aws-0-ap-southeast-1.pooler.supabase.com` |
| **Tên CSDL / Project** | `study_english` | `web-study-english-ai-test` | `study-english-prod` (Singapore) |
| **Kênh giám sát lỗi** | Console logs / Terminal | Sentry Staging Dashboard | Sentry Production Dashboard |

---

## 2. HƯỚNG DẪN ONBOARDING DÀNH CHO DEVELOPER MỚI (5 PHÚT)

Tất cả lập trình viên khi mới tham gia dự án **KHÔNG CẦN** tự cài đặt PostgreSQL trực tiếp vào hệ điều hành. Toàn bộ cơ sở dữ liệu đã được container hóa bằng **Docker Compose**.

### Bước 1: Khởi động Database cục bộ qua Docker
Yêu cầu máy dev đã mở **Docker Desktop**. Tại thư mục gốc của repository, chạy:

```bash
docker compose up -d
```
* Container `wsea-postgres` (Image `pgvector/pgvector:pg17`) sẽ được kích hoạt tại cổng `5432`.
* Dữ liệu được lưu trữ bền vững tại Docker Volume `pgdata`, không bị mất khi tắt máy hoặc restart container.

### Bước 2: Thiết lập biến môi trường Backend
Di chuyển vào thư mục `backend/`, copy file mẫu và khởi chạy Prisma:

```bash
cd backend
cp .env.example .env

# Cài đặt chính xác các thư viện
npm ci

# Đẩy schema lên database và sinh Prisma Client
npx prisma migrate dev

# Nạp dữ liệu từ điển mẫu (22 chủ đề, 2.000 từ vựng Oxford)
npm run seed
```

### Bước 3: Khởi chạy Backend và Frontend
* **Khởi động Backend (Port 3001):**
  ```bash
  # Tại thư mục backend
  npm run start:dev
  ```
* **Khởi động Frontend (Port 3000):**
  ```bash
  # Mở terminal mới, tại thư mục frontend
  npm ci
  npm run dev
  ```
* **Khởi động AI Service (Port 7860 - Dành cho AI Team):**
  ```bash
  cd ai-service
  python -m venv venv
  # Kích hoạt venv và cài dependencies
  pip install -r requirements.txt
  uvicorn app.main:app --port 7860 --reload
  ```

---

## 3. QUY TRÌNH VÀ HOẠT ĐỘNG CỦA PIPELINE CI/CD (GITHUB ACTIONS)

Toàn bộ kiểm định chất lượng mã nguồn được tự động hóa tại file cấu hình:
`.github/workflows/ci.yml`

```
                                [PULL REQUEST / PUSH]
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │  Môi trường CI: GitHub Cloud Runner   │
                      │       Hệ điều hành: ubuntu-latest     │
                      └───────────────────┬───────────────────┘
                                          │
                        ┌─────────────────┴─────────────────┐
                        ▼                                   ▼
             ┌─────────────────────┐             ┌─────────────────────┐
             │   BACKEND PIPELINE  │             │  FRONTEND PIPELINE  │
             ├─────────────────────┤             ├─────────────────────┤
             │ 1. npm ci (Clean)   │             │ 1. npm ci (Clean)   │
             │ 2. ESLint Check     │             │ 2. ESLint Check     │
             │ 3. Vitest Unit Test │             │ 3. Vitest Run       │
             │ 4. NestJS Build     │             │ 4. Vite/Next Build  │
             └─────────────────────┘             └─────────────────────┘
                                          │
                                  [ALL JOBS GREEN]
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │      CHO PHÉP MERGE VÀO DEVELOP       │
                      │  CD Kích hoạt: Auto-Deploy lên Render │
                      └───────────────────────────────────────┘
```

### 3.1. Các bước (Steps) chi tiết trong Pipeline:
1. **Checkout code (`actions/checkout@v4`):** Tải snapshot mã nguồn từ nhánh của PR về máy ảo CI.
2. **Setup Node.js 20 & Caching (`actions/setup-node@v4`):**
   * Thiết lập runtime Node.js LTS v20.
   * Kích hoạt cơ chế **npm cache** dựa trên checksum của `backend/package-lock.json` và `frontend/package-lock.json`. Giúp giảm 60% thời gian tải dependencies trên CI.
3. **Install Dependencies (`npm ci`):**
   * Bắt buộc sử dụng `npm ci` thay cho `npm install`.
   * Đảm bảo mọi bản build đều sử dụng đúng 100% phiên bản dependencies đã được khóa trong file `package-lock.json`.
4. **Linting (`eslint`):**
   * Kiểm tra tĩnh mã nguồn TypeScript/React, phát hiện biến không sử dụng, cú pháp sai chuẩn.
5. **Unit Testing (`npm test`):**
   * Chạy toàn bộ các test suites. Nếu có 1 bài test bị gãy, pipeline dừng ngay lập tức, chặn không cho merge code lỗi vào nhánh chính.
6. **Production Build (`npm run build`):**
   * Kiểm tra tính hợp lệ về kiểu dữ liệu (Type check) và đóng gói mã nguồn sang bản phân phối (`dist/` cho Backend, `.next/` cho Frontend).

### 3.2. Cơ chế CD (Continuous Deployment) liên kết:
* **Staging:** Khi PR được duyệt và merge vào `develop`, Render Webhook nhận tín hiệu và kích hoạt quy trình Build & Deploy tự động lên môi trường Staging.
* **Production:** Khi hoàn tất sprint và merge vào `main`, bản release chính thức được tự động triển khai lên Production.
* **Hệ thống AI Monitoring:** File workflow `.github/workflows/ai-service-keep-alive.yml` tự động gửi tín hiệu kiểm tra sức khỏe (`GET /health`) định kỳ 14 phút/lần, đảm bảo container AI không bị rơi vào trạng thái ngủ đông (Sleep Mode).

---

## 4. PRE-PUSH CHECKLIST DÀNH CHO DEVELOPER (TRÁNH LÀM GÃY CI)

Trước khi tạo Pull Request hoặc push code lên GitHub, các lập trình viên **bắt buộc** tự kiểm tra tại máy cá nhân theo 3 lệnh sau:

```bash
# 1. Kiểm tra Backend
cd backend
npm run lint
npm test
npm run build

# 2. Kiểm tra Frontend
cd ../frontend
npm run lint
npm run test:run
npm run build
```
> **Nguyên tắc vàng:** Nếu cả 3 lệnh trên đều vượt qua ở máy local, bạn chắc chắn 100% PR của mình sẽ XANH trên GitHub Actions!

---

## 5. NGUYÊN TẮC BẢO MẬT & QUẢN LÝ BIẾN MÔI TRƯỜNG (SECRETS MANAGEMENT)

1. **Tuyệt đối không commit file `.env` lên GitHub:**
   * File `.env` chứa thông tin nhạy cảm (JWT Secret, Database Credentials, API Keys).
   * Mọi cấu hình mới phải được khai báo mẫu vào file `.env.example` và thông báo cho DevOps.
2. **Bảo mật giao tiếp nội bộ (Internal Security - WSEA-94):**
   * Mọi API giao tiếp giữa Backend và AI Service gửi kèm header `x-api-key` (hỗ trợ song song `X-Internal-Api-Key`) với khóa bí mật `AI_SERVICE_KEY` (chuỗi dài >= 32 ký tự).
   * Sử dụng thuật toán so sánh hằng số thời gian (`secrets.compare_digest`) để ngăn chặn tấn công kênh phụ (Timing Attack). Sai hoặc thiếu khóa đều trả `401 Unauthorized`.
3. **Database Connection Pooling:**
   * Môi trường Serverless / Cloud Hosting (Render) kết nối tới Supabase phải đi qua cổng Connection Pooler (`5432` Session Mode hoặc `6543` Transaction Mode) để tránh hiện tượng tràn số lượng kết nối tối đa (Max Connections Exhaustion).

---

## 6. XỬ LÝ SỰ CỐ PHỔ BIẾN (TROUBLESHOOTING GUIDE)

| Hiện tượng | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| **Port 5432 already in use** | Máy dev đã cài sẵn PostgreSQL từ trước | Tắt service Postgres của Windows: Chạy lệnh `net stop postgresql-x64-16` hoặc đổi port ngoài của `docker-compose.yml` thành `5433:5432`. |
| **Prisma Error P1001 (Can't reach DB)** | Container Docker chưa bật hoặc Supabase Staging đang Pause | Chạy `docker compose up -d` (nếu ở Local). Nếu ở Staging, vào dashboard Supabase ấn `Resume Project`. |
| **CI bị lỗi Outdated Lockfile** | Thêm thư viện bằng `npm install` nhưng quên commit `package-lock.json` | Chạy lại `npm install` ở local, kiểm tra kỹ và commit cả file `package-lock.json` lên PR. |
| **ESLint Error (Prettier conflict)** | Format code chưa chuẩn quy định | Chạy `npm run format` tại backend hoặc `npm run lint -- --fix`. |

---
*Tài liệu được quản lý bởi Bộ phận DevOps - Dự án Web Study English AI.*
