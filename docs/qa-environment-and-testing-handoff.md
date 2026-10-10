# BẢN BÀN GIAO MÔI TRƯỜNG & KẾ HOẠCH KIỂM THỬ (QA/TESTER HANDOFF)

* **Dự án:** Web Study English AI (`web-study-english-ai`)
* **Kỹ sư DevOps:** Phạm Thái Bình
* **Bên tiếp nhận:** QA Team / Tester
* **Nhánh tích hợp:** `develop` (Commit: `14789f9`)
* **Thời gian phát hành:** 10/10/2026

---

## 1. TỔNG QUAN TÍCH HỢP & MA TRẬN MÔI TRƯỜNG KIỂM THỬ

Nhánh `develop` vừa hoàn tất tích hợp thành công các tính năng từ **PR #58** (AI Prediction Endpoint), **PR #59** (Tích hợp AI Scheduler & Fallback), và **PR #60** (Phân trang từ vựng).

| Thành phần | Môi trường STAGING (Chính) | Môi trường LOCAL (Tự lập) |
| :--- | :--- | :--- |
| **Frontend Web App** | Render Web Service (Staging URL) | `http://localhost:3000` |
| **Backend API** | `https://web-study-english-ai.onrender.com` | `http://localhost:3001` |
| **Swagger API Docs** | `https://web-study-english-ai.onrender.com/api` | `http://localhost:3001/api` |
| **AI Service** | Hugging Face Spaces / Render AI | `http://localhost:7860` |
| **Cơ sở dữ liệu** | Supabase Singapore (`web-study-english-ai-test`) | Docker (`wsea-postgres:5432`) |
| **Theo dõi lỗi / Sentry** | Sentry Staging Project | Terminal / Console DevTools |

---

## 2. PHẠM VI TRỌNG TÂM CẦN KIỂM THỬ (TEST SCOPE)

### 2.1. Quản lý Từ vựng & Phân trang (WSEA-90)
* **Màn hình:** `/vocabulary`
* **Nhiệm vụ kiểm thử:**
  1. Kiểm tra thanh phân trang (Pagination) khi danh sách từ vựng dài.
  2. Bấm chuyển qua lại giữa các trang (Page 1, 2, 3...) xem dữ liệu có tải mượt và đúng số lượng không.
  3. Kết hợp tìm kiếm từ khóa (Search) và phân trang xem có bị reset trang hoặc mất kết quả không.

### 2.2. Lập lịch Ôn tập Spaced Repetition với AI (WSEA-85 & WSEA-81)
* **Màn hình:** Luồng học & Ôn tập (Review Session).
* **Nhiệm vụ kiểm thử:**
  1. **Luồng chuẩn AI (FSRS):** Khi học viên đánh giá từ vựng (Again / Hard / Good / Easy), hệ thống gọi AI Service tính toán khoảng cách ngày ôn tập tiếp theo (`pending_interval_days`).
  2. **Bước học lại (Relearn step):** Bỏ qua AI ở bước học lại, đưa từ vào hàng đợi ôn tập tức thì.
  3. **Đường dự phòng (Fallback):** Giả lập AI Service ngắt kết nối. Backend phải tự động chuyển sang `simple-scheduler`, đảm bảo học viên không bị văng màn hình hay báo lỗi 500.

### 2.3. Kiểm thử tính toàn vẹn Dữ liệu sau Migration
* Áp dụng 2 migration mới:
  * `20261009102322_add_relearn_step`
  * `20261009103808_add_pending_interval_days`
* **Tiêu chí:** Dữ liệu học viên cũ và lịch sử học tập được bảo toàn nguyên vẹn.

---

## 3. CHECKLIST SETUP MÔI TRƯỜNG LOCAL TEST (NẾU CẦN)

```bash
# 1. Bật Database Docker
docker compose up -d

# 2. Áp dụng migration mới nhất
cd backend
npm ci
npx prisma migrate dev
npm run start:dev

# 3. Khởi động Frontend
cd ../frontend
npm ci
npm run dev
```

---

## 4. QUY TRÌNH BÁO CÁO LỖI (BUG REPORTING)

Mọi lỗi phát sinh xin vui lòng tạo Issue trên Jira/GitHub theo mẫu:
* **Môi trường:** Staging / Local
* **Các bước tái hiện (Steps to Reproduce):** Bước 1, 2, 3...
* **Kết quả thực tế vs Mong đợi (Actual vs Expected)**
* **Tài liệu đính kèm:** Screenshot, Network payload (F12) hoặc Link Trace Sentry.
