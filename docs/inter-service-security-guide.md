# Hướng Dẫn & Báo Cáo Bảo Mật Giao Tiếp Liên Dịch Vụ — Inter-Service Security (WSEA-94)

> **Mục tiêu:** Thiết lập cơ chế bảo mật giao tiếp nội bộ giữa **Backend NestJS** và **AI Service (FastAPI)** bằng khóa xác thực bí mật dùng chung (`INTERNAL_API_KEY`), bảo đảm các endpoint AI cốt lõi (FSRS, Vision, RAG) không bị bên ngoài khai thác trái phép và tuyệt đối không rò rỉ khóa ra phía trình duyệt (Frontend).

---

## 1. Sơ Đồ Kiến Trúc Luồng Xác Thực (BFF & Pre-shared Key)

```text
       Người Dùng / Trình Duyệt (Web Browser)
                         │
                         │ (1) HTTPS Request + JWT Session Cookie
                         ▼
        ┌───────────────────────────────────┐
        │        Frontend (Next.js)         │
        │  • Domain: vercel.app             │
        │  • KHÔNG giữ INTERNAL_API_KEY     │
        └─────────────────┬─────────────────┘
                          │
                          │ (2) API Request (Proxy qua Backend)
                          ▼
        ┌───────────────────────────────────┐
        │         Backend (NestJS)          │
        │  • Domain: onrender.com           │
        │  • Giữ biến: INTERNAL_API_KEY     │
        └─────────────────┬─────────────────┘
                          │
                          │ (3) Header: X-Internal-Api-Key: <SECRET_KEY>
                          ▼
        ┌───────────────────────────────────┐
        │        AI Service (FastAPI)       │
        │  • Nền tảng: HF Spaces / Docker   │
        │  • Giữ biến: INTERNAL_API_KEY     │
        │  • Dependency: verify_internal_key│
        └───────────────────────────────────┘
```

### Nguyên tắc thiết kế:
1. **Mô hình Backend-For-Frontend (BFF):** Trình duyệt không bao giờ giao tiếp trực tiếp với AI Service. Mọi yêu cầu liên quan đến dự báo quên từ, nhận diện hình ảnh hay hỏi đáp RAG đều phải đi qua Backend NestJS.
2. **Khóa bí mật nội bộ (Pre-shared Key):** Hai dịch vụ `backend` và `ai-service` dùng chung một chuỗi khóa bí mật được sinh ngẫu nhiên an toàn bằng mật mã học (32 bytes hex).
3. **Chống tấn công thời gian (Timing Attack Prevention):** Sử dụng thuật toán so sánh hằng thời gian `secrets.compare_digest` để đối soát khóa trong microservice.

---

## 2. Quy Chuẩn Header & Xử Lý Xác Thực

### 2.1. Tên Header Quy Định
- **Header gửi từ Backend NestJS:** `x-api-key` *(theo hợp đồng API v0.2 được Backend triển khai tại `ai-scheduler.client.ts`)*
- **Header tương thích:** `X-Internal-Api-Key` *(AI Service tại `deps.py` chấp nhận song song cả 2 header để đảm bảo an toàn tuyệt đối)*

### 2.2. Bảng Phân Loại Endpoint Bảo Vệ

| Phương thức | Đường dẫn | Cần khóa bảo mật? | Mã phản hồi khi vi phạm | Mục đích kỹ thuật |
| :---: | :--- | :---: | :---: | :--- |
| `GET` | `/health` | ❌ **Không (Public)** | — | Phục vụ GitHub Actions keep-alive định kỳ và kiểm tra sống còn của hạ tầng |
| `POST` | `/predict-retention` | ✅ **Bắt buộc** | `401 Unauthorized` (Thiếu hoặc Sai) | Bảo vệ tài nguyên tính toán mô hình dự báo quên từ FSRS |
| `POST` | `/recognize/image` | ✅ **Bắt buộc** | `401 Unauthorized` (Thiếu hoặc Sai) | Bảo vệ tài nguyên mô hình thị giác máy tính nhận diện từ vựng qua ảnh |
| `POST` | `/assistant/ask` | ✅ **Bắt buộc** | `401 Unauthorized` (Thiếu hoặc Sai) | Bảo vệ hạn ngạch LLM và dữ liệu tri thức RAG |

### 2.3. Quy Chuẩn Mã Lỗi HTTP
- **Thiếu header xác thực:** Trả về `401 Unauthorized` kèm thông báo `{"detail": "Thieu header X-Internal-Api-Key"}`.
- **Header có nhưng sai khóa:** Trả về `401 Unauthorized` kèm thông báo `{"detail": "Khoa API noi bo khong hop le"}`. *(Thống nhất dùng 401 cho cả 2 trường hợp để bảo mật, tránh làm lộ thông tin cho kẻ dò khóa)*.

---

## 3. Bảng Checklist Biến Môi Trường (Environment Variables)

| Thành phần | Tên biến | Mẫu giá trị (Example) | Mô tả |
| :--- | :--- | :--- | :--- |
| **ai-service** | `INTERNAL_API_KEY` | `d1d30e825cddc90440cd3fc8c2547dc4239216eb...` | Khóa bí mật nội bộ mà ai-service dùng để đối chiếu (>= 32 ký tự) |
| **backend** | `AI_SERVICE_URL` | `http://localhost:7860` (Dev) / `https://<space>.hf.space` (Prod) | Địa chỉ URL gọi đến AI Service |
| **backend** | `AI_SERVICE_KEY` / `INTERNAL_API_KEY` | *(Cùng giá trị với ai-service)* | Khóa bí mật gửi kèm header `x-api-key` (>= 32 ký tự) |
| **frontend** | *(Không có)* | — | **Tuyệt đối không khai báo** `INTERNAL_API_KEY` hoặc biến `NEXT_PUBLIC_*` liên quan đến AI |

---

## 4. Bằng Chứng Nghiệm Thu Kiểm Thử Tự Động (Automated Test Evidence)

Bộ kiểm thử tự động `ai-service/tests/test_auth.py` được xây dựng để xác minh 100% các tiêu chí bảo mật của Task WSEA-94:

```text
============================= test session starts =============================
platform win32 -- Python 3.14.7, pytest-9.1.1, pluggy-1.6.0
rootdir: C:\Users\ADMIN\Desktop\Project1\web-study-english-ai\ai-service
configfile: pytest.ini

ai-service\tests\test_auth.py::test_health_endpoint_is_public PASSED                   [ 16%]
ai-service\tests\test_auth.py::test_predict_forgetting_missing_key_returns_401 PASSED  [ 33%]
ai-service\tests\test_auth.py::test_predict_forgetting_wrong_key_returns_401 PASSED    [ 50%]
ai-service\tests\test_auth.py::test_predict_forgetting_valid_internal_key_passes_auth PASSED [ 66%]
ai-service\tests\test_auth.py::test_legacy_x_api_key_header_passes_auth PASSED        [ 83%]
ai-service\tests\test_auth.py::test_vision_and_rag_endpoints_require_auth PASSED      [100%]

======================== 6 passed, 1 warning in 0.69s =========================
```

### Kết quả rà soát tĩnh Frontend (Client-side Security Audit):
- Quét toàn bộ mã nguồn `frontend/src`: **0 phát hiện** về `INTERNAL_API_KEY`, `7860` hay bất kỳ URL nội bộ nào.
- Toàn bộ biến môi trường phía trình duyệt chỉ gồm 2 biến công khai chuẩn: `NEXT_PUBLIC_API_URL` và `NEXT_PUBLIC_SENTRY_DSN`.
- Bảo đảm 100% an toàn bảo mật thông tin, không bị dò khóa qua DevTools hay Network tab của trình duyệt.
