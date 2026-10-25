# WSEA-139: Kiến Trúc Bộ Đệm Xử Lý Sự Cố Hạ Tầng (Infrastructure Resilience Buffer)

## 1. Giới thiệu tổng quan
Hệ thống **Web Study English AI** vận hành trên môi trường đám mây phân tán kết hợp giữa **Render** (Backend NestJS API & Postgres Supabase) và **Hugging Face Spaces** (AI Microservice chạy mô hình FSRS và RAG). 

Do đặc thù của hạ tầng máy chủ đám mây thế hệ mới (Serverless / Container-based Free & Hobby Tiers), hệ thống thường xuyên đối mặt với 4 thách thức hạ tầng cốt lõi:
1. **Sự cố "Cold Start" (Khởi động lạnh)**: Dịch vụ AI trên Hugging Face tự động rơi vào trạng thái ngủ đông (Sleep) khi không có request trong 15–30 phút. Khi được đánh thức, các request đầu tiên sẽ nhận mã `503 Service Unavailable` hoặc bị quá hạn (Timeout).
2. **Sự cố nghẽn lưu lượng đột biến (Thundering Herd)**: Khi một dịch vụ hồi phục, nếu toàn bộ client đồng loạt retry ở cùng một mốc thời gian, dịch vụ sẽ lập tức sập trở lại.
3. **Cạn kiệt tài nguyên máy chủ (Resource Starvation)**: Máy chủ Render tier cơ bản giới hạn 512MB RAM. Việc bung quá nhiều luồng gọi HTTP đồng thời có thể gây cạn socket và treo tiến trình (Out of Memory - OOM).
4. **Mạng chập chờn (Transient Network Failures)**: Đứt kết nối tạm thời (`ECONNRESET`, `ETIMEDOUT`, `UND_ERR_CONNECT_TIMEOUT`).

**Task WSEA-139** xây dựng kiến trúc **Bộ đệm 4 tầng (4-Layer Infrastructure Resilience Buffer)** nhằm cách ly sự cố, tự động phục hồi (Self-healing), và đảm bảo tính khả dụng 99.9% cho trải nghiệm người học.

---

## 2. Mô hình Kiến Trúc Bộ Đệm 4 Tầng

```
                                      [ Yêu Cầu Từ Học Viên ]
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TẦNG 1: BỘ ĐỆM KIỂM SOÁT TẢI ĐỒNG THỜI (Concurrency Limiter Buffer)                             │
│ - Giới hạn tối đa 5 luồng gọi AI song song, xếp hàng đợi yêu cầu dư thừa                        │
│ - Ngăn ngừa cạn kiệt bộ nhớ 512MB RAM và treo Event Loop của Node.js                            │
└────────────────────────────────┬────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TẦNG 2: RÀO CHẮN TRẠNG THÁI 3 CẤP (3-State Circuit Breaker State Machine)                       │
│                                                                                                 │
│    [ CLOSED ] ────────(3 lỗi liên tiếp)────────► [  OPEN  ]                                     │
│        ▲                                            │                                           │
│        │                                            │ (Hết 20s timeout)                         │
│        │                                            ▼                                           │
│   (Thăm dò OK) ◄────────────── [ HALF_OPEN ] ◄──────┘                                           │
│                                (Gửi 1 probe)                                                    │
└────────────────────────────────┬────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TẦNG 3: BỘ ĐỆM THỬ LẠI THÔNG MINH (Smart Retry with Exponential Backoff & Full Jitter)          │
│ - Công thức trễ: Delay = random(0, min(maxDelay, baseDelay * 2^attempt))                        │
│ - Phân tán ngẫu nhiên tải khi Hugging Face Spaces thức dậy (chống Thundering Herd)              │
│ - Tự động retry các mã lỗi: 503 (Cold start), 502, 504, 429, timeout, network error             │
└────────────────────────────────┬────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TẦNG 4: BỘ ĐỆM DỰ PHÒNG CỤC BỘ KHÔNG ĐỘ TRỄ (0ms Graceful Fallback Buffer)                      │
│ - Ôn tập thẻ từ: Lập tức chuyển sang Simple Scheduler lũy thừa chuẩn (0ms gián đoạn)            │
│ - Trợ lý AI: Phản hồi từ kho từ điển ngữ pháp cục bộ kèm lời nhắn thân thiện                    │
│ - Tuyệt đối không để lộ lỗi 500 ra giao diện người dùng                                        │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Chi tiết các thành phần kỹ thuật

### 3.1. Thuật toán Exponential Backoff với Full Jitter
Thay vì thử lại sau khoảng thời gian cố định gây dồn cục lưu lượng, hệ thống áp dụng công thức chuẩn công nghiệp (AWS Architecture Pattern):
$$T_{\text{wait}} = \text{random}\left(0, \min(T_{\text{max}}, T_{\text{base}} \times 2^{\text{attempt}})\right)$$
* `baseDelayMs`: 1.000 ms
* `maxDelayMs`: 5.000 ms
* `maxRetries`: 2 lần

### 3.2. Rào chắn tự phục hồi (Circuit Breaker State Machine)
* **CLOSED**: Vận hành bình thường. Bộ đếm `consecutiveFailures` theo dõi lỗi liên tiếp. Khi đạt `failureThreshold = 3`, rào chắn nhảy sang `OPEN`.
* **OPEN**: Toàn bộ cuộc gọi ra ngoài bị ngắt ngay lập tức, chuyển thẳng sang Fallback trong **0ms** mà không làm người dùng phải chờ timeout. Lưu mốc thời gian `openedAt`.
* **HALF_OPEN**: Sau `resetTimeoutMs = 20.000ms`, rào chắn tự động chuyển sang trạng thái thăm dò. Nếu 2 probe request liên tiếp thành công, rào chắn tự động đóng lại (`CLOSED`). Nếu thất bại, rào chắn quay lại `OPEN`.

### 3.3. Cơ chế Warm-up Buffer chống Cold Start
* Tích hợp phương thức `warmupAiService()` chủ động gửi tín hiệu làm ấm không đồng bộ tới Hugging Face Spaces (`https://hieusss-wsea-ai-service.hf.space/health`).
* Phát hiện sớm trạng thái `503 Service Unavailable (Model loading)` để chuẩn bị bộ đệm trước khi người học bắt đầu phiên học từ vựng hay đặt câu hỏi ngữ pháp.

---

## 4. Danh mục API Quản trị & Diễn tập Sự Cố (Chaos Simulation)

| Endpoint | Method | Chức năng |
| :--- | :---: | :--- |
| `/api/infra-resilience/status` | `GET` | Báo cáo chi tiết: trạng thái Circuit Breaker (`CLOSED`/`OPEN`/`HALF_OPEN`), số lỗi liên tiếp, số cuộc gọi phục hồi qua retry, số cuộc gọi fallback, số luồng active. |
| `/api/infra-resilience/warmup` | `POST` | Kích hoạt làm ấm Hugging Face Spaces và đo độ trễ mạng thực tế. |
| `/api/infra-resilience/circuit-breaker/trip` | `POST` | Ngắt cưỡng bức Circuit Breaker sang `OPEN` để diễn tập kịch bản sập hạ tầng ngoài. |
| `/api/infra-resilience/circuit-breaker/reset` | `POST` | Khôi phục trạng thái Circuit Breaker về `CLOSED`. |
| `/api/infra-resilience/reset-metrics` | `POST` | Đặt lại các bộ đếm đo lường. |

---

## 5. Kịch bản Diễn tập & Tự động hoá (DevOps Automation)
Script PowerShell diễn tập sự cố được lưu tại [scripts/simulate-infra-failure.ps1](file:///c:/Users/ADMIN/Desktop/Project1/web-study-english-ai/scripts/simulate-infra-failure.ps1):
```powershell
# Chạy diễn tập kịch bản sập hạ tầng và tự phục hồi trên local:
.\scripts\simulate-infra-failure.ps1

# Chạy kiểm tra trên Production:
.\scripts\simulate-infra-failure.ps1 -Production
```

---

## 6. Kết quả Kiểm thử & Đảm bảo Chất lượng (QA)
- **Bộ kiểm thử đơn vị**: **15/15 test suites passed (137/137 tests pass 100%)**.
  - `infra-resilience.service.spec.ts`: 10/10 tests pass (Kiểm thử 3 trạng thái Circuit Breaker, Exponential backoff jitter trên lỗi 503, Concurrency limiter, Warm-up ping, Fallback 0ms).
  - `ai-scheduler.client.spec.ts`: 3/3 tests pass (Kiểm thử kết nối bộ đệm).
  - `assistant.client.spec.ts`: 3/3 tests pass.
- **ESLint & Prettier**: 0 lỗi (Exit code 0).
- **NestJS Build**: Clean build (Exit code 0).
