# BÁO CÁO KỸ THUẬT: KIỂM TRA TOÀN DIỆN MÔI TRƯỜNG CHẠY THẬT (WSEA-174)
## (Full Production Environment Verification & Audit Report)

> **Mã công việc (Jira Work Item):** WSEA-174  
> **Tiêu đề task:** Kiểm tra toàn diện môi trường chạy thật  
> **Sản phẩm đầu ra:** Production ổn định (Kèm bộ ảnh minh chứng thực tế)  
> **Người thực hiện:** Phạm Thái Bình (DevOps / Backend Engineer)  
> **Đợt phát triển:** Đợt 11 (D31–D33)  
> **Thời gian kiểm định:** 12/11/2026  
> **Trạng thái nghiệm thu:** **100% ĐẠT TIÊU CHUẨN (PRODUCTION READY)**  

---

## 1. MỤC TIÊU VÀ PHẠM VI KIỂM ĐỊNH TOÀN DIỆN

Nhằm chuẩn bị tối ưu cho buổi báo cáo và bảo vệ đồ án tốt nghiệp, Task **WSEA-174** đặt trọng tâm vào việc đánh giá độ ổn định thực tế của toàn bộ hệ sinh thái dịch vụ đám mây (Cloud Infrastructure) đang vận hành bản phát hành `v1.2.0`:

| Phân hệ / Dịch vụ | Nền tảng hạ tầng | Địa chỉ truy cập Production | Vai trò kỹ thuật |
| :--- | :--- | :--- | :--- |
| **Giao diện Người học (Frontend)** | Vercel Edge Network | `https://web-study-english-ai.vercel.app` | Cung cấp giao diện Next.js App Router v1.2 |
| **Dịch vụ API Cốt lõi (Backend)** | Render Web Service | `https://web-study-english-ai-prod.onrender.com` | Xử lý nghiệp vụ NestJS, bảo mật JWT, AdminGuard |
| **Cơ sở dữ liệu (PostgreSQL 17)** | Supabase Cloud (Singapore) | Session Pooler qua Supavisor (Port 5432) | Lưu trữ 7.000 từ vựng Oxford và 187 bài đọc B1 |
| **Kho ảnh trực quan (Cloud Storage)** | Supabase Storage | Bucket `vision-images` (Public CDN) | Lưu trữ ảnh đại diện và ảnh nhận diện CLIP |
| **Dịch vụ Trí tuệ Nhân tạo (AI Service)**| Hugging Face Spaces | `https://hieusss-wsea-ai-service.hf.space` | Chạy 4 model: CLIP, FSRS, E5, Intent Classifier |
| **Giám sát lỗi thời gian thực (APM)** | Sentry Monitoring | Org ID: `o4512043886575616` | Giám sát ngoại lệ thời gian thực (Real-time APM) |

---

## 2. KẾT QUẢ KIỂM TRA 10 LUỒNG NGHIỆP VỤ (SMOKE TEST 10/10 PASS)

Kỹ sư DevOps đã xây dựng và thực thi kịch bản kiểm thử tự động trực tiếp trên môi trường chạy thật (`scratch/run_wsea174_audit.js`). Kết quả đạt **10/10 nghiệp vụ đạt chuẩn (100%)**:

```text
================================================================================
📊 BẢNG ĐỐI SOÁT KIỂM THỬ NGHIỆP VỤ PRODUCTION (WSEA-174 AUDIT MATRIX)
--------------------------------------------------------------------------------
STT  Trạng thái  Phân hệ kiểm thử                        HTTP   Độ trễ   Chi tiết kiểm chứng nghiệp vụ
--------------------------------------------------------------------------------
01   ✓ PASS      Frontend Vercel Web Portal              200    220ms    Next.js App Router v1.2 Live
02   ✓ PASS      Backend & Supabase PostgreSQL Check     200    197ms    DB: UP (4ms), Uptime: 79h liên tục
03   ✓ PASS      Nghiệp vụ Đăng nhập & Cấp phát JWT      200    193ms    User: demo@gmail.com, Token hợp lệ
04   ✓ PASS      Nghiệp vụ Kho Từ vựng Oxford/CEFR       200    112ms    7.000 từ trong kho, phân trang mượt
05   ✓ PASS      Nghiệp vụ Tra cứu & Tìm kiếm Từ vựng    200    163ms    Từ khóa 'computer' -> Trả về đúng từ
06   ✓ PASS      Nghiệp vụ Thống kê Tiến độ & FSRS       200    122ms    Tính toán chính xác dữ liệu học tập
07   ✓ PASS      Phân hệ Đọc hiểu Tiếng Anh B1           200    107ms    187 bài đọc đã biên soạn sẵn sàng
08   ✓ PASS      Phân hệ Vision AI CLIP & Cloud Storage  200    450ms    Nhận diện Top 5 nhãn CLIP & Lưu Storage
09   ✓ PASS      Bảo mật AdminGuard (Chặn trái phép)     401     73ms    401 Unauthorized (Bảo vệ an toàn)
10   ✓ PASS      Dịch vụ AI Microservice (Hugging Face)  200    759ms    Sẵn sàng 4 mô hình AI cốt lõi
--------------------------------------------------------------------------------
KẾT LUẬN: 10/10 NGHIỆP VỤ HOẠT ĐỘNG HOÀN HẢO — PRODUCTION ỔN ĐỊNH 100%.
================================================================================
```

---

## 3. KIỂM TRA ĐỘ ỔN ĐỊNH VÀ CƠ CHẾ CHỐNG NGỦ ĐÔNG DỊCH VỤ AI (AI SERVICE HEALTH)

### 3.1. Hiện tượng kiểm nghiệm thực tế:
- **Trạng thái ngủ đông (Cold Start):** Sau 48 giờ không có lượt truy cập, không gian Hugging Face Spaces chuyển sang chế độ ngủ. Lượt gọi đánh thức đầu tiên mất **25.55 giây**.
- **Trạng thái đã làm ấm (Warmed-up):** Sau khi được đánh thức, các lượt gọi tiếp theo có độ trễ giảm xuống chỉ còn **759 mili-giây (0.75s)**.
- **Tỷ lệ tăng tốc:** Nhanh hơn **34 lần (3.400%)**.

### 3.2. Trạng thái 4 mô hình AI được nạp vào bộ nhớ RAM:
1. `vision` (**OpenAI CLIP ViT-B/32**): Phân loại và nhận diện đồ vật từ ảnh tải lên.
2. `fsrs` (**Free Spaced Repetition Scheduler**): Tính toán ngày đến hạn ôn tập thẻ từ vựng.
3. `embedder` (**Multilingual-E5-small**): Vector hóa câu từ phục vụ tìm kiếm tương đồng ngữ nghĩa.
4. `intent` (**Zero-shot Classification**): Định tuyến câu hỏi người học tới trợ lý ngữ pháp.

---

## 4. KIỂM THỬ HIỆU NĂNG VÀ THỜI GIAN PHẢN HỒI BẰNG K6 (50 VIRTUAL USERS)

Kỹ sư DevOps đã thực hiện bài kiểm thử chịu tải k6 mô phỏng **50 người dùng đồng thời (50 VUs)** lặp liên tục trong vòng 1 phút 30 giây:

* **Lệnh thực thi:**
  ```powershell
  k6 run -e TARGET_URL=https://web-study-english-ai-prod.onrender.com tests/k6/system-load-test.js
  ```
* **Kết quả đo lường tổng thể:**
  - **Tổng số request HTTP:** **1.175 requests** (Throughput trung bình: **12.62 req/s**).
  - **Tỷ lệ lỗi (Error Rate):** **0.00%** (**0 lỗi** trên tổng số 1.175 request).
  - **Tổng số điều kiện kiểm tra (Checks):** **1.880 / 1.880 passed (100.00%)**.
  - **Độ trễ trung bình:** 1.52 giây (Median: 1.17 giây) dưới tải nặng 50 người dùng gửi request dồn dập.
  - **Độ trễ Health Check:** Tối thiểu 78.11ms, trung vị 520ms.

---

## 5. DANH SÁCH VẤN ĐỀ VẬN HÀNH VÀ KẾ HOẠCH XỬ LÝ (ACTION ITEMS — BƯỚC 4)

| Vấn đề phát hiện | Đánh giá mức độ rủi ro | Kế hoạch và Giải pháp kỹ thuật đã áp dụng |
| :--- | :---: | :--- |
| **1. Hugging Face Spaces ngủ đông sau 48h** | 🟡 Trung bình | • Duy trì workflow `.github/workflows/backend-keep-alive.yml` ping định kỳ.<br>• Kỹ sư DevOps thực hiện thao tác **Pre-warm (Mở trước link health)** 5 phút trước giờ bảo vệ để đảm bảo độ trễ < 800ms. |
| **2. Tải cực hạn làm tăng p(95) trên Render** | 🟢 Thấp | • Dưới tải 50 người dùng liên tục, server Render gói Starter (512MB RAM) vẫn duy trì 0% lỗi.<br>• Trong thực tế buổi demo hội đồng chỉ có 1–2 người chấm, độ trễ trung bình chỉ ~200ms, hoàn toàn mượt mà. |
| **3. Bảo mật Endpoint quản trị viên** | 🟢 Đã giải quyết | • Triển khai `AdminGuard` kiểm tra JWT Role ADMIN và Header bí mật `x-admin-key`.<br>• Xác thực kiểm thử chặn 100% request trái phép (`401 Unauthorized`). |

---

## 6. DANH MỤC ẢNH MINH CHỨNG ĐÍNH KÈM JIRA

Toàn bộ 4 ảnh chụp minh chứng chất lượng cao đã được xuất vào thư mục ngoài Desktop: `C:\Users\ADMIN\Desktop\wsea174_minh_chung\`:

1. `wsea174_minh_chung_1_smoke_test_dashboard.png`: Bảng kiểm thử toàn diện 10 luồng nghiệp vụ đạt chuẩn 10/10 PASS (100%).
2. `wsea174_minh_chung_2_ai_service_warmup_keepalive.png`: Bằng chứng so sánh độ trễ AI Service (Cold start 25.5s vs Warm-up 759ms).
3. `wsea174_minh_chung_3_k6_load_test_summary.png`: Bảng kết quả k6 tải 50 VUs (1.175 requests, 0.00% lỗi).
4. `wsea174_minh_chung_4_production_architecture_matrix.png`: Ma trận giám sát hạ tầng đám mây và an toàn bảo mật.

---

## 7. KẾT LUẬN NGHIỆM THU

Hệ thống **Web Study English AI (v1.2.0)** trên môi trường chạy thật đã hoàn thành toàn diện 4 bước kiểm định của Task **WSEA-174**:
- Hoạt động ổn định, thông suốt 100% các phân hệ nghiệp vụ.
- Dịch vụ AI sẵn sàng, cơ chế giữ ấm hoạt động hiệu quả.
- Tỷ lệ lỗi chịu tải đạt mức tuyệt đối 0.00%.
- Đủ điều kiện kỹ thuật để đóng task trên Jira và chuyển tiếp sang Task **WSEA-176 (Sao lưu & Chuẩn bị dự phòng)**.
