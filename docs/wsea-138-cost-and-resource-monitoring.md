# WSEA-138: Hướng dẫn & Tài liệu Kiến trúc Giám sát Chi phí và Tài nguyên AI

## 1. Giới thiệu tổng quan
Hệ thống **Web Study English AI** tích hợp hai phân hệ trí tuệ nhân tạo trọng yếu:
1. **FSRS Microservice** (`/predict-retention` trên Hugging Face Spaces): Dự báo xác suất ghi nhớ từ vựng và tự động cá nhân hóa khoảng cách thời gian ôn tập thẻ từ.
2. **LLM Assistant RAG** (`/assistant/ask` tích hợp RAG): Trợ lý học tập trực tiếp giải đáp thắc mắc ngữ pháp, ngữ cảnh từ vựng và bài đọc IELTS.

Để bảo vệ ngân sách đồ án (**500.000 VNĐ ~ $20 USD**) và ngăn chặn các sự cố cạn kiệt tài nguyên máy chủ hoặc chi phí leo thang không kiểm soát, **Task WSEA-138** thiết lập hệ thống giám sát thời gian thực (Cost & Resource Monitoring), cơ chế cảnh báo 3 cấp độ (3-Level Thresholding) và rào chắn ngắt tự động (Circuit Breaker).

---

## 2. Bảng giá quy chuẩn (Pricing Matrix) & Ngân sách
Dựa trên bảng giá mô hình ngôn ngữ và embedding tiêu chuẩn (tương đương chuẩn GPT-4o-mini & OpenAI embeddings):
* **Prompt Tokens**: `$0.15` / 1.000.000 tokens
* **Completion Tokens**: `$0.60` / 1.000.000 tokens
* **Tỷ giá chuyển đổi**: `25.000 VNĐ / USD`
* **Hạn mức ngân sách tối đa**: `500.000 VNĐ`

Công thức tính chi phí cho mỗi lượt gọi $i$:
$$\text{CostUSD}_i = \left(\frac{\text{PromptTokens}_i}{10^6} \times 0.15\right) + \left(\frac{\text{CompletionTokens}_i}{10^6} \times 0.60\right)$$
$$\text{TotalCostVND} = \left(\sum \text{CostUSD}_i\right) \times 25.000$$

---

## 3. Cơ chế cảnh báo 3 cấp độ & Circuit Breaker

```
   0% ──────────── 70% ──────────── 85% ──────────── 100% ────► Tiêu hao (%)
  [   NORMAL   ]  |  [ WARNING_70 ] | [HIGH_ALERT_85] | [ CIRCUIT BREAKER ]
                  |                 |                 |
             350.000 VNĐ       425.000 VNĐ       500.000 VNĐ
             (Cảnh báo vàng)   (Cảnh báo cam)     (Ngắt gọi AI - Fallback)
```

| Cấp độ | Ngưỡng tiêu hao | Mức chi phí | Hành động hệ thống | Trạng thái Circuit Breaker |
| :--- | :---: | :---: | :--- | :---: |
| **NORMAL** | $< 70\%$ | $< 350.000$ VNĐ | Vận hành bình thường, ghi nhận telemetry | `CLOSED` |
| **WARNING_70** | $\ge 70\%$ | $\ge 350.000$ VNĐ | Log mức cảnh báo, theo dõi gia tăng lưu lượng | `CLOSED` |
| **HIGH_ALERT_85** | $\ge 85\%$ | $\ge 425.000$ VNĐ | Gửi cảnh báo Warning tới Sentry, siết chặt timeout | `CLOSED` |
| **CIRCUIT_BREAKER** | $\ge 100\%$ | $\ge 500.000$ VNĐ | Gửi Critical Alert tới Sentry, tự động chuyển chế độ dự phòng | `OPEN` (Ngắt hoàn toàn) |

### Cơ chế Fallback khi Circuit Breaker kích hoạt
Khi `isCircuitBreakerOpen() === true`:
* **Ôn tập FSRS (`AiSchedulerClient`)**: Lập tức trả về `null` trong $0$ms, kích hoạt công thức dự phòng offline (Simple Scheduler thuật toán lũy thừa chuẩn). Người học ôn bài mượt mà không bị gián đoạn hay chờ đợi.
* **Trợ lý LLM (`AssistantClient`)**: Lập tức trả về `null`, kích hoạt mẫu phản hồi hỗ trợ tra cứu từ điển cục bộ kèm thông báo thân thiện.

---

## 4. Danh mục API Endpoints

### 4.1. `GET /api/ai-monitor/summary`
Báo cáo toàn diện tình hình chi phí, token tiêu thụ và đối soát ngân sách:
```json
{
  "timestamp": "2026-10-25T14:15:00.000Z",
  "totalCalls": 128,
  "successCalls": 126,
  "failedCalls": 2,
  "successRate": 98.44,
  "avgLatencyMs": 312,
  "tokens": {
    "promptTokens": 142500,
    "completionTokens": 58200,
    "totalTokens": 200700
  },
  "costs": {
    "totalCostUsd": 0.0563,
    "totalCostVnd": 1408,
    "budgetLimitVnd": 500000,
    "budgetRemainingVnd": 498592,
    "consumedPercentage": 0.28,
    "exchangeRateVnd": 25000,
    "thresholdStatus": "NORMAL",
    "thresholdMessage": "Chi phí trong tầm kiểm soát an toàn (< 70% ngân sách)",
    "circuitBreakerOpen": false
  },
  "services": {
    "FSRS_RETENTION": { "calls": 98, "success": 98, "failed": 0, "avgLatencyMs": 140, "totalCostUsd": 0.012 },
    "LLM_ASSISTANT_RAG": { "calls": 30, "success": 28, "failed": 2, "avgLatencyMs": 650, "totalCostUsd": 0.0443 }
  }
}
```

### 4.2. `GET /api/ai-monitor/resources`
Đo lường tài nguyên phần cứng máy chủ backend và đo độ trễ kết nối Hugging Face Space:
```json
{
  "memoryRssMb": 98.42,
  "heapUsedMb": 54.12,
  "heapTotalMb": 72.5,
  "uptimeSeconds": 14205,
  "aiServiceHealth": {
    "status": "UP",
    "latencyMs": 148,
    "endpoint": "https://hieusss-wsea-ai-service.hf.space",
    "models": ["fsrs-v4", "clip-vit-base-patch32"]
  }
}
```

### 4.3. `POST /api/ai-monitor/circuit-breaker`
Kích hoạt hoặc khôi phục Circuit Breaker thủ công cho mục đích diễn tập sự cố hoặc quản trị viên can thiệp:
```json
// Body:
{ "open": true }

// Phản hồi:
{
  "success": true,
  "circuitBreakerOpen": true,
  "message": "Đã kích hoạt ngắt Circuit Breaker: Chuyển toàn bộ cuộc gọi AI sang fallback offline"
}
```

---

## 5. Script kiểm tra vận hành (DevOps Automation)
Script PowerShell được tạo tại [scripts/check-ai-resources.ps1](file:///c:/Users/ADMIN/Desktop/Project1/web-study-english-ai/scripts/check-ai-resources.ps1):
```powershell
# Chạy kiểm tra môi trường Production
.\scripts\check-ai-resources.ps1

# Chạy kiểm tra môi trường Localhost
.\scripts\check-ai-resources.ps1 -Local
```

---

## 6. Kết quả kiểm thử & Đảm bảo chất lượng (QA)
- **Bộ kiểm thử đơn vị**: 14/14 test suites passed (127 tests), trong đó:
  - `ai-monitor.service.spec.ts`: 8/8 tests pass (Kiểm thử chính xác công thức token, ngưỡng cảnh báo 70%, 85%, 100%, ngắt cưỡng bức).
  - `ai-scheduler.client.spec.ts`: 3/3 tests pass (Kiểm thử fallback $0$ms khi circuit breaker bật).
- **Compilation**: `nest build` hoàn thành với mã thoát $0$ (Clean build).
