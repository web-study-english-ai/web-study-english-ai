# Hướng dẫn Cơ chế Chống ngủ & Đánh thức Dịch vụ AI (WSEA-95)

> **Mục tiêu:** Đảm bảo dịch vụ AI (`ai-service` chạy trên Hugging Face Spaces hoặc Render Free Tier) luôn ở trạng thái hoạt động (Ready), không bị đưa về trạng thái ngủ (Sleep/Idle) sau 15 phút không có lượt truy cập, giảm thiểu tối đa độ trễ khởi động lại (Cold Start 30s - 60s) cho người dùng cuối.

---

## 1. Tổng quan cơ chế Chống ngủ (Keep-Alive)

- **Nguyên lý hoạt động:** Các nền tảng như Hugging Face Spaces (CPU Basic) và Render (Free Web Service) tự động tắt container nếu không có request HTTP trong vòng **15 phút**.
- **Giải pháp:** Thiết lập GitHub Actions Workflow định kỳ ping endpoint kiểm tra sức khoẻ (`GET /health`) mỗi **14 phút** (`*/14 * * * *`). Tần suất này đảm bảo container luôn nhận được tín hiệu truy cập trước khi chạm ngưỡng 15 phút không hoạt động.
- **Tệp cấu hình:** [ai-service-keep-alive.yml](file:///.github/workflows/ai-service-keep-alive.yml)

---

## 2. Cấu hình biến môi trường trên GitHub Repository

Để workflow có thể gọi đến đúng dịch vụ AI mà không lộ URL nội bộ trong mã nguồn công khai, DevOps cần cấu hình Secret:

1. Truy cập vào GitHub Repository: `https://github.com/web-study-english-ai/web-study-english-ai`
2. Chọn **Settings** > **Secrets and variables** > **Actions**.
3. Nhấn **New repository secret**:
   - **Name:** `AI_SERVICE_HEALTH_URL`
   - **Secret:** `https://<ten-space>.hf.space/health` (hoặc URL endpoint `/health` của Render).
4. Nhấn **Add secret** để hoàn tất.

---

## 3. Cách đánh thức dịch vụ thủ công (Manual Wake-Up)

Khi dịch vụ AI vừa được triển khai, hoặc trong trường hợp workflow bị gián đoạn dẫn đến container rơi vào trạng thái ngủ, DevOps hoặc Developer có thể đánh thức theo các cách sau:

### Cách 1: Kích hoạt thủ công từ GitHub Actions (Khuyên dùng)

1. Truy cập tab **Actions** trên GitHub.
2. Chọn workflow **AI Service Keep Alive** ở cột bên trái.
3. Nhấn vào menu thả xuống **Run workflow**:
   - Có thể để trống để dùng secret mặc định hoặc điền URL cần test.
   - Nhấn nút xanh **Run workflow**.
4. Quá trình chạy sẽ gửi request với cấu hình `timeout 45s` và `retry 2 lần` để đợi container khởi động xong.

### Cách 2: Gọi trực tiếp bằng cURL / PowerShell (Từ máy cá nhân)

- **Sử dụng cURL (Linux / macOS / Git Bash):**

  ```bash
  curl -v -m 60 "https://<ten-space>.hf.space/health"
  ```

  _(Lưu ý: Lần gọi đầu tiên khi máy đang ngủ có thể mất từ 25 - 45 giây để khởi động lại)._

- **Sử dụng PowerShell (Windows):**

  ```powershell
  Invoke-RestMethod -Uri "https://<ten-space>.hf.space/health" -Method Get -TimeoutSec 60
  ```

- **Kết quả trả về khi thức tỉnh thành công:**
  ```json
  {
    "status": "ok",
    "service": "web-study-english-ai-service",
    "version": "0.1.0",
    "environment": "production"
  }
  ```

### Cách 3: Đánh thức qua Dashboard nền tảng

- **Hugging Face Spaces:** Truy cập trực tiếp vào URL Space. Nếu đang ở trạng thái `Sleeping`, giao diện HF sẽ hiển thị thông báo `Restarting Space` và tự động dựng lại container trong vòng 1 phút.
- **Render:** Vào Service Dashboard > Nhấn **Manual Deploy** > **Deploy latest commit** hoặc truy cập URL trực tiếp trên trình duyệt.

---

## 4. Quy trình theo dõi trong 24 giờ (Monitoring Checklist)

Sau khi đưa workflow vào hoạt động, DevOps tiến hành giám sát trong 24 giờ đầu tiên để đảm bảo tính ổn định:

| Thời điểm      | Hạng mục kiểm tra                                 | Tiêu chí đạt                                          | Kết quả ghi nhận |
| :------------- | :------------------------------------------------ | :---------------------------------------------------- | :--------------: |
| **Giờ thứ 1**  | Kích hoạt thủ công & quan sát lần chạy đầu tiên   | HTTP Status 200, thời gian phản hồi < 2s              |     Đạt [ ]      |
| **Giờ thứ 4**  | Kiểm tra lịch sử chạy định kỳ trên GitHub Actions | Các job chạy cách nhau 14 phút, đều có màu xanh       |     Đạt [ ]      |
| **Giờ thứ 12** | Kiểm tra trạng thái Space trên Hugging Face       | Space giữ nguyên badge `Running`, không bị `Sleeping` |     Đạt [ ]      |
| **Giờ thứ 24** | Rà soát tổng hợp log 24 giờ                       | Không có lượt ping nào bị Timeout hoặc gián đoạn      |     Đạt [ ]      |

---

## 5. Lưu ý kỹ thuật & Tối ưu hoá

1. **GitHub Actions Schedule Delay:** Lịch cron của GitHub Actions là dạng "best-effort" và có thể bị trễ từ 1 - 3 phút vào các giờ cao điểm. Việc chọn chu kỳ **14 phút** (thay vì sát 15 phút) sẽ tạo ra biên độ an toàn, đảm bảo container không bị ngủ ngay cả khi lượt chạy cron bị trễ nhẹ.
2. **User-Agent Header:** Request gửi đi kèm header `User-Agent: GitHubActions-KeepAlive/1.0` giúp DevOps dễ dàng lọc log truy cập và phân biệt giữa traffic người dùng thật với request kiểm tra sức khoẻ.
