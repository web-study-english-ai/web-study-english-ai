# Hướng dẫn Cơ chế Chống ngủ & Tối ưu Quota Backend Render (WSEA-95)

> **Mục tiêu:** Giữ ấm dịch vụ Backend (`web-study-english-ai` chạy trên Render Free Tier) trong khung giờ vàng học tập (07:00 – 23:00 GMT+7), triệt tiêu độ trễ khởi động lạnh (**Cold Start 50s – 70s**), đồng thời **tối ưu hoá và bảo vệ hạn ngạch 750 giờ/tháng** của Render workspace, không gây cạn kiệt tài nguyên cho môi trường Staging.

---

## 1. Bối cảnh kỹ thuật & Phân tích giải pháp

### 1.1. Phân biệt mục tiêu Keep-Alive: Backend vs Hugging Face Space
- **Hugging Face Spaces (CPU Basic):** Dịch vụ AI chỉ tạm dừng (Sleep) sau **48 giờ** không có hoạt động. Do đó, việc gửi request định kỳ 14 phút tới Hugging Face là hoàn toàn dư thừa.
- **Render Web Service (Free Tier):** Tự động đưa container vào trạng thái ngủ đông (Spin Down) chỉ sau **15 phút** không nhận request HTTP. Khi có người học truy cập, container mất từ **50 đến 70 giây** để khởi động lại (Cold Start). Đây chính là nguyên nhân gây nghẽn trải nghiệm người dùng.
- **Quyết định kiến trúc:** Chuyển toàn bộ cơ chế Keep-Alive định kỳ sang endpoint `/health` của **Backend Node.js trên Render**.

### 1.2. Bài toán hạn ngạch 750 giờ/tháng của Render
Tài khoản Render Free Tier cấp **750 compute hours/tháng** dùng chung cho toàn bộ workspace:
- Nếu chạy định kỳ **24/7** (cả ngày lẫn đêm): Dịch vụ tiêu tốn `24 x 31 = 744 giờ/tháng` (chiếm **99.2%** hạn ngạch).
- Toàn bộ workspace chỉ còn lại vỏn vẹn **6 giờ/tháng** cho môi trường Staging. Nếu vượt quá 750 giờ, Render sẽ **tạm dừng ngay lập tức TẤT CẢ dịch vụ** cho đến đầu tháng tiếp theo — rủi ro đặc biệt nghiêm trọng nếu rơi vào giai đoạn nghiệm thu hoặc bảo vệ đồ án.
- **Giải pháp tối ưu:** Thiết lập lịch chạy cron trong khung giờ người học thức: **07:00 – 22:59 GMT+7** (tương ứng `00:00 – 15:59 UTC`):
  $$\text{Số giờ tiêu thụ} = 16 \text{ giờ/ngày} \times 31 \text{ ngày} = 496 \text{ giờ/tháng}$$
  $$\text{Hạn ngạch dư dả cho Staging} = 750 - 496 = 254 \text{ giờ/tháng}$$
  Đảm bảo Staging có thể chạy test, build preview và demo buổi tối thoải mái mà không lo sập hệ thống.

---

## 2. Cấu hình GitHub Actions Workflow

- **Tệp workflow:** [.github/workflows/backend-keep-alive.yml](file:///.github/workflows/backend-keep-alive.yml)
- **Tần suất kích hoạt:** Mỗi 14 phút (`*/14 0-15 * * *`), đủ sớm trước mốc 15 phút idle timeout của Render.

```yaml
name: Backend Keep Alive

on:
  schedule:
    # 07:00 - 22:59 GMT+7 (00:00 - 15:59 UTC)
    - cron: "*/14 0-15 * * *"
  workflow_dispatch:
    inputs:
      target_url:
        description: "URL kiểm tra sức khoẻ (mặc định lấy URL Production hoặc Secret BACKEND_HEALTH_URL)"
        required: false
        default: ""
```

### Cải tiến kiểm tra mã HTTP chuẩn xác
Để khắc phục lỗi khi server gặp sự cố (502 Bad Gateway hoặc 500 Internal Error) trả về trang HTML nhiều dòng làm sai lệch bộ lọc grep, workflow tách riêng response body vào file tạm và trích xuất chính xác HTTP Code:

```bash
BODY_FILE=$(mktemp)
HTTP_CODE=$(curl -sS -o "$BODY_FILE" -w "%{http_code}" \
  --connect-timeout 15 \
  --max-time 45 \
  --retry 2 \
  --retry-delay 5 \
  -H "User-Agent: GitHubActions-KeepAlive/1.0" \
  "$URL" || echo "000")

if [[ "$HTTP_CODE" =~ ^2[0-9]{2}$ ]]; then
  echo "✅ Dịch vụ Backend đang hoạt động bình thường (Status: $HTTP_CODE)."
else
  echo "::error::Ping thất bại hoặc trả về mã lỗi HTTP: $HTTP_CODE (Yêu cầu mã 2xx)"
  exit 1
fi
```

---

## 3. Cấu hình GitHub Repository Secrets

Để đảm bảo an toàn bảo mật và tính linh hoạt:
1. Truy cập: `https://github.com/web-study-english-ai/web-study-english-ai/settings/secrets/actions`
2. Khai báo Secret:
   - **Tên:** `BACKEND_HEALTH_URL`
   - **Giá trị:** `https://web-study-english-ai-prod.onrender.com/health` (hoặc URL backend tương ứng).
   - *(Ghi chú: Workflow hỗ trợ fallback tự động sang secret cũ `AI_SERVICE_HEALTH_URL` nếu chưa kịp cập nhật).*

---

## 4. Hướng dẫn kích hoạt & Đánh thức thủ công (Manual Wake-Up)

### Cách 1: Kích hoạt thủ công từ GitHub Actions
1. Vào tab **Actions** trên GitHub.
2. Chọn workflow **Backend Keep Alive**.
3. Bấm **Run workflow** (có thể điền URL Staging hoặc để trống để ping Production).

### Cách 2: Gọi bằng PowerShell / cURL
- **PowerShell:**
  ```powershell
  Invoke-RestMethod -Uri "https://web-study-english-ai-prod.onrender.com/health" -Method Get -TimeoutSec 60
  ```
- **cURL:**
  ```bash
  curl -v -m 60 "https://web-study-english-ai-prod.onrender.com/health"
  ```
- **Phản hồi chuẩn từ Backend (`200 OK`):**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-11T10:30:00.000Z",
    "uptime": 12450.5
  }
  ```

---

## 5. Bảng kiểm tra giám sát 24 Giờ (Monitoring Checklist)

| Thời điểm | Hạng mục kiểm tra | Tiêu chí đạt | Kết quả |
| :--- | :--- | :--- | :---: |
| **07:00 GMT+7** | Lượt ping đầu tiên trong ngày | Đánh thức container sau đêm nghỉ, HTTP 200, phản hồi < 60s | Đạt [ ] |
| **08:00 – 22:00** | Các chu kỳ ban ngày (mỗi 14 phút) | Container luôn ấm, thời gian phản hồi ping < 1.5s, không bị Cold Start | Đạt [ ] |
| **23:00 GMT+7** | Dừng chu kỳ vào ban đêm | Workflow ngừng chạy theo cron `0-15 UTC`, backend tự hạ để tiết kiệm quota | Đạt [ ] |
| **Render Usage** | Kiểm tra Render Dashboard | Tốc độ tiêu hao giờ không vượt quá 16h/ngày, Staging hoạt động ổn định | Đạt [ ] |

---

## 6. Chính sách an toàn thông tin & Quản lý Secret
- Biến mẫu `dev-internal-key-32-chars-long-for-wsea-2026` trong file `.env.example` là **mock dummy key** chỉ dùng cho lập trình cá nhân offline (Localhost).
- Khóa bảo mật giao tiếp giữa Backend và AI Service trên Staging và Production là chuỗi **64 ký tự hex ngẫu nhiên** được sinh trực tiếp và lưu trên **Render Dashboard** / **Hugging Face Secret**, tuyệt đối không lưu trong mã nguồn hoặc commit Git.
