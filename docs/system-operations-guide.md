# TÀI LIỆU VẬN HÀNH VÀ TRIỂN KHAI HỆ THỐNG (SYSTEM OPERATIONS GUIDE)
## DỰ ÁN: WEB STUDY ENGLISH AI (`web-study-english-ai`)

* **Mã công việc (Jira):** WSEA-175 — Hoàn thiện tài liệu vận hành (Đợt 11: D31–D33)
* **Kỹ sư phụ trách:** Phạm Thái Bình (DevOps & Backend Engineer)
* **Phiên bản hệ thống:** v1.2 Production Release (Ổn định hóa & Sẵn sàng bảo vệ đồ án)
* **Ngày cập nhật:** 13/11/2026
* **Đối tượng tiếp nhận:** Giảng viên hướng dẫn, Hội đồng phản biện, Nhóm phát triển & Vận hành

---

## MỤC LỤC

1. [Tổng Quan Kiến Trúc Hệ Thống Production](#1-tổng-quan-kiến-trúc-hệ-thống-production)
2. [Phần 1: Hướng Dẫn Cài Đặt Trên Máy Sạch & Kiểm Chứng Nghiệm Thu](#2-phần-1-hướng-dẫn-cài-đặt-trên-máy-sạch--kiểm-chứng-nghiệm-thu)
   - [2.1. Yêu cầu môi trường tối thiểu (Prerequisites)](#21-yêu-cầu-môi-trường-tối-thiểu-prerequisites)
   - [2.2. Trình tự cài đặt từng bước (Step-by-Step Setup)](#22-trình-tự-cài-đặt-từng-bước-step-by-step-setup)
   - [2.3. Bảng kiểm chứng nghiệm thu (Acceptance Verification Matrix)](#23-bảng-kiểm-chứng-nghiệm-thu-acceptance-verification-matrix)
3. [Phần 2: Hướng Dẫn Triển Khai Từng Thành Phần Lên Cloud](#3-phần-2-hướng-dẫn-triển-khai-từng-thành-phần-lên-cloud)
   - [3.1. Triển khai Frontend Portal (Vercel Edge Network)](#31-triển-khai-frontend-portal-vercel-edge-network)
   - [3.2. Triển khai Backend REST API (Render Web Service)](#32-triển-khai-backend-rest-api-render-web-service)
   - [3.3. Triển khai AI Microservice (Hugging Face Spaces Docker)](#33-triển-khai-ai-microservice-hugging-face-spaces-docker)
   - [3.4. Quản lý Cơ sở dữ liệu Cloud (Supabase PostgreSQL + pgvector)](#34-quản-lý-cơ-sở-dữ-liệu-cloud-supabase-postgresql--pgvector)
   - [3.5. Bảng tổng hợp biến môi trường trọng yếu (Environment Config Matrix)](#35-bảng-tổng-hợp-biến-môi-trường-trọng-yếu-environment-config-matrix)
4. [Phần 3: Hướng Dẫn Sao Lưu, Khôi Phục & Xử Lý Sự Cố (Runbook)](#4-phần-3-hướng-dẫn-sao-lưu-khôi-phục--xử-lý-sự-cố-runbook)
   - [4.1. Chính sách và cơ chế sao lưu dữ liệu (Backup Policy)](#41-chính-sách-và-cơ-chế-sao-lưu-dữ-liệu-backup-policy)
   - [4.2. Quy trình diễn tập khôi phục (Restore Drill SOP & Audit Result)](#42-quy-trình-diễn-tập-khôi-phục-restore-drill-sop--audit-result)
   - [4.3. Sổ tay ứng cứu sự cố kỹ thuật (Troubleshooting & Incident Response)](#43-sổ-tay-ứng-cứu-sự-cố-kỹ-thuật-troubleshooting--incident-response)
   - [4.4. Phương án dự phòng Offline Local phục vụ diễn tập & bảo vệ đồ án](#44-phương-án-dự-phòng-offline-local-phục-vụ-diễn-tập--bảo-vệ-đồ-án)

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG PRODUCTION

Hệ thống **Web Study English AI** được thiết kế theo kiến trúc Microservices phân tán nhiều tầng (Multi-tier Cloud Architecture), phân tách độc lập giữa Presentation, Business Logic, AI Intelligence và Data Storage:

```
                            Trình Duyệt Người Dùng (Client Browser)
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼ (HTTPS / DNS Anycast)                             ▼ (REST API / JWT Session)
     ┌──────────────────────────────┐                    ┌──────────────────────────────┐
     │       Frontend Portal        │                    │      Backend Core API        │
     │ • Nền tảng: Vercel Edge      │─── CORS/Cookie ───►│ • Nền tảng: Render Web App   │
     │ • Công nghệ: Next.js 14 App  │                    │ • Công nghệ: NestJS + Prisma │
     │ • URL: web-study-english-    │                    │ • URL: web-study-english-    │
     │        ai.vercel.app         │                    │        ai-prod.onrender.com  │
     └──────────────────────────────┘                    └──────────────┬───────────────┘
                                                                        │
                    ┌───────────────────────────────────────────────────┼──────────────────────────────────┐
                    ▼ (Internal REST / Bearer Token)                    │                                  ▼ (SSL Postgres Pooler)
     ┌──────────────────────────────┐                                   │                   ┌──────────────────────────────┐
     │       AI Microservice        │                                   │                   │   PostgreSQL + pgvector DB   │
     │ • Nền tảng: Hugging Face     │                                   │                   │ • Nền tảng: Supabase Cloud   │
     │ • Công nghệ: FastAPI, PyTorch│                                   │                   │ • Lưu trữ: 7.000 từ vựng,    │
     │ • Model: FSRS, Embeddings    │                                   │                   │   187 bài đọc CEFR, Vectors  │
     │ • URL: hieusss-wsea-ai-      │                                   │                   │ • Region: Singapore          │
     │        service.hf.space      │                                   │                   └──────────────────────────────┘
     └──────────────────────────────┘                                   │
                                                                        ▼
                                                         ┌──────────────────────────────┐
                                                         │     Giám Sát & Cảnh Báo      │
                                                         │ • Sentry APM & Error Tracking│
                                                         │ • GitHub Actions Cron Ping   │
                                                         └──────────────────────────────┘
```

---

## 2. PHẦN 1: HƯỚNG DẪN CÀI ĐẶT TRÊN MÁY SẠCH & KIỂM CHỨNG NGHIỆM THU

### 2.1. Yêu cầu môi trường tối thiểu (Prerequisites)
Để triển khai hệ thống từ một máy tính hoàn toàn mới (Clean Machine), môi trường cần đáp ứng các điều kiện sau:

| Thành phần | Phiên bản yêu cầu | Mục đích sử dụng | Kiểm tra lệnh |
| :--- | :--- | :--- | :--- |
| **Hệ điều hành** | Windows 10/11 Pro, macOS Sonoma+, Ubuntu 22.04+ | Nền tảng thực thi | `systeminfo` / `uname -a` |
| **Node.js** | `>= 20.10.0 LTS` | Runtime cho Backend và Frontend | `node -v` |
| **npm** | `>= 10.2.0` | Trình quản lý gói phụ thuộc | `npm -v` |
| **Docker Desktop** | `>= 24.0.0` (Docker Compose v2) | Vận hành CSDL PostgreSQL & pgvector | `docker compose version` |
| **Git** | `>= 2.40.0` | Quản lý mã nguồn phân tán | `git --version` |
| **Python** *(tùy chọn)*| `>= 3.10` | Chạy AI Microservice cục bộ (nếu cần) | `python --version` |

---

### 2.2. Trình tự cài đặt từng bước (Step-by-Step Setup)

#### Bước 1: Tải mã nguồn về máy
```bash
git clone https://github.com/hieunguyenthe505/web-study-english-ai.git
cd web-study-english-ai
git checkout develop
```

#### Bước 2: Cài đặt các gói phụ thuộc (Dependencies)
Mở terminal và tiến hành cài đặt cho từng khối chức năng:
```bash
# 1. Cài đặt thư viện cho Backend
cd backend
npm install
cd ..

# 2. Cài đặt thư viện cho Frontend
cd frontend
npm install
cd ..
```

#### Bước 3: Thiết lập biến môi trường cục bộ
Tạo các tệp môi trường từ cấu hình mẫu:

* **Tệp `backend/.env`:**
```env
PORT=3001
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/study_english?schema=public"
JWT_ACCESS_SECRET="dev-jwt-access-secret-key-32-chars-minimum"
JWT_ACCESS_EXPIRES_IN=900
REFRESH_TOKEN_TTL_DAYS=7
REFRESH_COOKIE_NAME="wsea_rt_dev"
COOKIE_SECURE=false
COOKIE_SAMESITE="lax"
CORS_ORIGIN="http://localhost:3000"
FRONTEND_URL="http://localhost:3000"
AI_SERVICE_URL="https://hieusss-wsea-ai-service.hf.space"
AI_SERVICE_API_KEY=""
```

* **Tệp `frontend/.env.local`:**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

#### Bước 4: Khởi động Cơ sở dữ liệu Docker cục bộ
Khởi chạy dịch vụ PostgreSQL kèm extension `pgvector` thông qua Docker Compose:
```bash
docker compose up -d postgres
```
*Kiểm tra trạng thái container:*
```bash
docker ps --filter "name=wsea-postgres"
```
*(Kết quả hiển thị `Status: Up ... (healthy)` trên cổng `0.0.0.0:5432->5432/tcp`).*

#### Bước 5: Đồng bộ Schema CSDL & Nạp dữ liệu Seeder đầy đủ
Thực thi Prisma migrate để tạo cấu trúc bảng và nạp 7.000 từ vựng cùng 187 bài đọc:
```bash
cd backend
# Đồng bộ schema vào cơ sở dữ liệu
npx prisma db push

# Nạp kho dữ liệu hạt giống (Seed 7.000 từ vựng Oxford/CEFR, 187 bài đọc và tài khoản kiểm thử)
npx prisma db seed
cd ..
```

#### Bước 6: Khởi chạy ứng dụng
Mở 2 cửa sổ terminal độc lập:
* **Terminal 1 (Backend API):**
  ```bash
  cd backend
  npm run start:dev
  # API sẵn sàng lắng nghe tại http://localhost:3001/api
  ```
* **Terminal 2 (Frontend Web):**
  ```bash
  cd frontend
  npm run dev
  # Ứng dụng web sẵn sàng tại http://localhost:3000
  ```

---

### 2.3. Bảng kiểm chứng nghiệm thu (Acceptance Verification Matrix)

Sau khi hoàn tất cài đặt, thực hiện đối soát theo bảng tiêu chuẩn nghiệm thu sau:

| STT | Hạng mục kiểm tra | Endpoint / Thao tác | Kết quả kỳ vọng | Trạng thái xác nhận |
| :---: | :--- | :--- | :--- | :---: |
| 1 | **Backend API Health Check** | `GET http://localhost:3001/api/health` | HTTP 200, `database: { status: "up" }` |  Đạt |
| 2 | **Database Integrity** | Kiểm tra số lượng bản ghi DB | 7.000 từ vựng, 187 bài đọc, 22 chủ đề |  Đạt |
| 3 | **Frontend Portal** | Truy cập `http://localhost:3000/login` | Giao diện đăng nhập hiển thị đầy đủ |  Đạt |
| 4 | **Xác thực người dùng** | Đăng nhập: `demo@gmail.com` / `password123` | Đăng nhập thành công, điều hướng về Dashboard |  Đạt |
| 5 | **Học từ vựng FSRS** | Vào mục Học từ vựng / Flashcard | Danh sách từ vựng nạp bình thường, chấm điểm thuật toán FSRS mượt mà |  Đạt |
| 6 | **Luyện đọc hiểu CEFR** | Mở 1 bài đọc ngẫu nhiên (A1–B2) | Bài đọc hiển thị trơn tru kèm bộ câu hỏi trắc nghiệm |  Đạt |

---

## 3. PHẦN 2: HƯỚNG DẪN TRIỂN KHAI TỪNG THÀNH PHẦN LÊN CLOUD

### 3.1. Triển khai Frontend Portal (Vercel Edge Network)
* **Nhà cung cấp:** Vercel Inc. (Hạ tầng Serverless & Global Edge CDN).
* **Quy trình triển khai:**
  1. Kết nối repository GitHub `web-study-english-ai` với dự án trên Vercel.
  2. Cấu hình **Root Directory**: `frontend`.
  3. Cấu hình **Framework Preset**: `Next.js`.
  4. Lệnh Build: `next build` (Tự động tối ưu hóa tài nguyên tĩnh và phân trang SSG/SSR).
  5. Cấu hình Environment Variables trên Vercel:
     - `NEXT_PUBLIC_API_URL`: `https://web-study-english-ai-prod.onrender.com/api`
     - `NEXT_PUBLIC_SENTRY_DSN`: Khóa DSN giám sát frontend.
  6. **Cơ chế CD:** Tự động kích hoạt build và deploy mỗi khi có commit mới được merge vào nhánh `main`.

---

### 3.2. Triển khai Backend REST API (Render Web Service)
* **Nhà cung cấp:** Render Services (Singapore / Oregon Region).
* **Quy trình triển khai:**
  1. Tạo mới **Web Service** trên Render kết nối với nhánh `main`.
  2. Cấu hình thông số kỹ thuật:
     - **Root Directory:** `backend`
     - **Environment:** `Node`
     - **Build Command:** `npm install && npx prisma generate && npm run build`
     - **Start Command:** `npm run start:prod`
     - **Plan:** Free / Starter Instance (512 MB RAM, 0.5 CPU).
  3. **Lưu ý kỹ thuật quan trọng:**
     - Ứng dụng phải lắng nghe biến `process.env.PORT` do Render cấp phát động (mặc định là cổng `10000` trên container hoặc `3001`).
     - Bắt buộc bind host về `0.0.0.0` để proxy của Render nhận diện được trạng thái Healthy.
  4. **Cơ chế chống ngủ đông (Keep-Alive Cron):**
     - Do gói Free của Render sẽ tự động ngủ (Sleep) sau 15 phút không có traffic, hệ thống kích hoạt workflow GitHub Actions `.github/workflows/keep-alive.yml` gửi request `GET /health` định kỳ mỗi 10 phút.

---

### 3.3. Triển khai AI Microservice (Hugging Face Spaces Docker)
* **Nhà cung cấp:** Hugging Face Spaces.
* **Đặc tả kiến trúc:**
  - **Dung lượng & Cấu hình:** 2 vCPU, 16 GB RAM (CPU Basic).
  - **Docker Base Image:** `python:3.10-slim`.
  - **Port lắng nghe:** `7860`.
  - **Các mô hình tích hợp:**
    - `all-MiniLM-L6-v2`: Sinh vector nhúng (Embeddings) 384 chiều cho từ vựng và câu hỏi.
    - `FSRS v4.5`: Thuật toán tính toán chu kỳ lặp lại ngắt quãng (Spaced Repetition).
    - `Intent Classifier`: Bộ phân loại ý định người dùng trong khung chat trợ lý AI.
* **Cơ chế bảo mật liên dịch vụ:**
  - Giao tiếp giữa Backend Render và AI Space được bảo vệ qua header `X-API-Key` bí mật.

---

### 3.4. Quản lý Cơ sở dữ liệu Cloud (Supabase PostgreSQL + pgvector)
* **Nhà cung cấp:** Supabase Cloud (Hạ tầng AWS ap-southeast-1, Singapore).
* **Thông số cấu hình:**
  - **Phiên bản:** PostgreSQL 15.6.
  - **Tiện ích mở rộng (Extensions):** `uuid-ossp`, `pgcrypto`, `vector` (pgvector 384 dimensions).
  - **Connection Pooling (pgBouncer):** Cổng `6543` (Transaction Mode) phục vụ các truy vấn đồng thời từ nhiều serverless client; Cổng `5432` (Session Mode) phục vụ Prisma migration.
  - **Bảo mật:** Buộc bật SSL (`sslmode=require`).

---

### 3.5. Bảng tổng hợp biến môi trường trọng yếu (Environment Config Matrix)

| Biến môi trường | Vị trí áp dụng | Mô tả chức năng | Mức độ nhạy cảm |
| :--- | :--- | :--- | :---: |
| `NODE_ENV` | Backend Render | Thiết lập chế độ chạy (`production`) | Công khai |
| `DATABASE_URL` | Backend Render | Chuỗi kết nối Supabase có mã hóa SSL | **Bảo mật cao** |
| `JWT_ACCESS_SECRET` | Backend Render | Khóa ký số JWT token (tối thiểu 32 ký tự) | **Bảo mật tuyệt đối** |
| `REFRESH_COOKIE_NAME` | Backend Render | Tên định danh cookie phiên (`wsea_rt_prod`) | Nội bộ |
| `COOKIE_SECURE` | Backend Render | Bắt buộc truyền cookie qua HTTPS (`true`) | Công khai |
| `COOKIE_SAMESITE` | Backend Render | Cho phép gửi cookie chéo domain (`none`) | Công khai |
| `CORS_ORIGIN` | Backend Render | Tên miền Frontend được phép gọi API | Nội bộ |
| `AI_SERVICE_URL` | Backend Render | URL endpoint của AI Hugging Face Space | Nội bộ |
| `AI_SERVICE_API_KEY` | Backend & AI Space | Khóa xác thực liên dịch vụ (Inter-service Key) | **Bảo mật cao** |
| `SENTRY_DSN` | Backend & Frontend | Endpoint gửi telemetry lỗi về Sentry Dashboard | Nội bộ |

---

## 4. PHẦN 3: HƯỚNG DẪN SAO LƯU, KHÔI PHỤC & XỬ LÝ SỰ CỐ (RUNBOOK)

### 4.1. Chính sách và cơ chế sao lưu dữ liệu (Backup Policy)

Nhằm đảm bảo an toàn tuyệt đối cho dữ liệu người dùng và kho học liệu chuẩn CEFR, hệ thống áp dụng chính sách sao lưu chuẩn doanh nghiệp:

* **Công cụ cốt lõi:** `pg_dump` tạo tệp lưu trữ nhị phân nén Custom Archive (`-F c -b -v`).
* **Mục tiêu điểm khôi phục (RPO):** `< 24 giờ` (Tối đa mất mát không quá dữ liệu của 1 ngày).
* **Mục tiêu thời gian khôi phục (RTO):** `< 10 phút` (Thời gian nạp lại toàn bộ DB vào máy chủ mới).
* **Tần suất thực hiện:**
  - *Tự động:* Hàng ngày lúc 02:00 AM (GMT+7) thông qua GitHub Actions `.github/workflows/database-backup.yml`. Bản sao lưu được đẩy vào GitHub Artifacts với mã hóa SHA-256 (lưu trữ 14 ngày).
  - *Thủ công:* Kỹ sư DevOps chạy script trước mỗi đợt Release Production lớn hoặc trước ngày bảo vệ đồ án.

#### Lệnh thực hiện sao lưu thủ công:
* **Trên Windows PowerShell:**
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/backup-db.ps1
  ```
* **Trên Linux / macOS:**
  ```bash
  chmod +x scripts/backup-db.sh
  ./scripts/backup-db.sh
  ```
*(Tệp xuất ra nằm tại thư mục `backups/wsea_backup_YYYYMMDD_HHMMSS.dump` với dung lượng chuẩn ~1.25 MB).*

---

### 4.2. Quy trình diễn tập khôi phục (Restore Drill SOP & Audit Result)

Nhằm tránh tình trạng "sao lưu được nhưng không khôi phục được", quy trình diễn tập khôi phục độc lập bắt buộc phải được tiến hành định kỳ.

#### Các bước khôi phục vào CSDL mới:
1. Tạo CSDL trống đích:
   ```sql
   CREATE DATABASE study_english_restore_test;
   ```
2. Thực thi lệnh nạp bản dump qua `pg_restore`:
   ```bash
   pg_restore -h localhost -p 5432 -U postgres -d study_english_restore_test --clean --if-exists --no-owner --no-privileges backups/wsea_backup_latest.dump
   ```
3. Chạy script đối chiếu tự động:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/verify-restore-drill.ps1
   ```

#### Biên bản đối soát toàn vẹn dữ liệu thực tế (WSEA-176):
Kết quả kiểm tra đối soát trực tiếp giữa CSDL Gốc và CSDL Khôi phục đã ghi nhận **chính xác 100%**:

| Tên bảng dữ liệu | Số bản ghi gốc | Số bản ghi sau Restore | Tỷ lệ toàn vẹn | Đánh giá |
| :--- | :---: | :---: | :---: | :---: |
| **`topics`** (Chủ đề từ vựng) | 22 | 22 | **100%** |  Khớp tuyệt đối |
| **`words`** (Kho từ vựng Oxford/CEFR) | 7.000 | 7.000 | **100%** |  Khớp tuyệt đối |
| **`reading_passages`** (Bài đọc hiểu) | 187 | 187 | **100%** |  Khớp tuyệt đối |
| **`users`** (Tài khoản người dùng) | 7 | 7 | **100%** |  Khớp tuyệt đối |
| **`user_cards`** (Tiến độ học FSRS) | 223 | 223 | **100%** |  Khớp tuyệt đối |
| **`_prisma_migrations`** (Lịch sử migration) | 10 | 10 | **100%** |  Khớp tuyệt đối |

---

### 4.3. Sổ tay ứng cứu sự cố kỹ thuật (Troubleshooting & Incident Response)

#### Sự cố 1: Dịch vụ AI Microservice bị quá tải hoặc Cold Start lâu (> 5s)
* **Hiện tượng:** Người dùng yêu cầu giải thích ngữ pháp hoặc phân tích từ vựng nhưng khung chat quay vô tận.
* **Nguyên nhân:** Hugging Face Space rơi vào trạng thái Paused hoặc đường truyền quốc tế bị nghẽn.
* **Cách xử lý của hệ thống:**
  - Backend đã tích hợp cơ chế **Circuit Breaker** (WSEA-139): Nếu AI Service timeout 3 lần liên tiếp, Circuit Breaker tự động bật trạng thái `OPEN` để bảo vệ server, trả về phản hồi fallback thông minh dựa trên Rule-based và Từ điển Merriam-Webster offline trong DB mà không làm sập luồng học.
* **Hành động của kỹ sư:**
  - Truy cập Hugging Face Space `https://huggingface.co/spaces/hieusss/wsea-ai-service` bấm **Restart this Space**.

#### Sự cố 2: Lỗi cạn kiệt kết nối CSDL Supabase (Connection Pool Exhaustion)
* **Hiện tượng:** API trả về mã lỗi `HTTP 500` kèm log Prisma: `Can't reach database server at aws-0-ap-southeast-1.pooler.supabase.com`.
* **Nguyên nhân:** Có nhiều kết nối treo chưa được giải phóng hoặc truy vấn tải cao vượt quá giới hạn pool của Supabase Free Tier.
* **Cách xử lý:**
  - Đổi biến `DATABASE_URL` trong Render Dashboard sang cổng Transaction Pooling `6543` kèm tham số `?pgbouncer=true&connection_limit=10`.
  - Khởi động lại Web Service trên Render để giải phóng toàn bộ connection cũ.

#### Sự cố 3: Lỗi Cookie phiên làm việc trên trình duyệt (CORS / SameSite)
* **Hiện tượng:** Đăng nhập thành công nhưng khi chuyển sang trang Dashboard thì bị văng trở lại trang Login.
* **Nguyên nhân:** Trình duyệt chặn cookie bên thứ ba (Third-party Cookie) do Frontend nằm ở Vercel còn Backend nằm ở Render.
* **Cách xử lý:**
  - Kiểm tra biến môi trường Backend: `COOKIE_SECURE=true`, `COOKIE_SAMESITE="none"`.
  - Hướng dẫn người dùng tắt tính năng "Block third-party cookies" trên trình duyệt Chrome/Brave hoặc truy cập qua cửa sổ ẩn danh.

---

### 4.4. Phương án dự phòng Offline Local phục vụ diễn tập & bảo vệ đồ án

Trong trường hợp phòng hội đồng bảo vệ bị mất mạng Internet, Wi-Fi chập chờn hoặc các dịch vụ đám mây công cộng (Vercel, Render, Supabase) bị sự cố bất khả kháng, hệ thống đã được trang bị **Kịch bản chuyển đổi dự phòng tức thì sang môi trường Offline cục bộ**:

```mermaid
flowchart TD
    A["Mất mạng / Cloud gặp sự cố"] --> B["Chạy kịch bản: start-local-demo.bat"]
    B --> C["Docker wsea-postgres nạp CSDL đầy đủ (Port 5432)"]
    B --> D["NestJS API Local khởi động (Port 3001)"]
    B --> E["Next.js Web Portal khởi động (Port 3000)"]
    C & D & E --> F["Trình duyệt tự động mở http://localhost:3000/login"]
    F --> G["Buổi trình diễn tiếp tục mượt mà 100% không cần Internet"]
```

#### Quy trình kích hoạt bản dự phòng:
1. **Khởi động:** Click đúp vào file kịch bản hoặc chạy lệnh terminal tại thư mục gốc:
   ```powershell
   .\start-local-demo.bat
   ```
2. **Kiểm tra:** Hệ thống tự động kiểm tra Docker `wsea-postgres`, bật Backend (3001), bật Frontend (3000) và tự mở trang `http://localhost:3000/login`.
3. **Đăng nhập trình chiếu:**
   - Tài khoản: `demo@gmail.com`
   - Mật khẩu: `password123`
4. **Dừng hệ thống sau khi demo:**
   ```powershell
   .\stop-local-demo.bat
   ```

---

## 5. KẾT LUẬN & KIẾN NGHỊ BÀN GIAO

Tài liệu vận hành hệ thống này được biên soạn trên cơ sở kết quả đo kiểm thực tế từ **WSEA-174** (Kiểm tra tải k6 đạt 99.64% thành công trên Production) và **WSEA-176** (Sao lưu và diễn tập phục hồi CSDL đạt 100% toàn vẹn dữ liệu). 

Hệ thống **Web Study English AI** hiện đã đạt trạng thái sẵn sàng cao nhất (Production-Ready) cả về mặt hạ tầng Cloud phân tán lẫn phương án dự phòng cục bộ, đảm bảo tính liên tục của dịch vụ và đáp ứng toàn diện các tiêu chuẩn kỹ thuật để bảo vệ đồ án tốt nghiệp.

---
*Tài liệu được ký duyệt bởi Kỹ sư DevOps: Phạm Thái Bình*  
*Đợt 11 — Dự án Web Study English AI*

