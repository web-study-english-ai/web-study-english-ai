# Hợp đồng API — ai-service ↔ backend NestJS

Đây là nguồn sự thật cho giao diện giữa dịch vụ AI và backend.
**Sửa file này TRƯỚC khi sửa code.** Mọi thay đổi trường, kiểu dữ liệu hoặc mã lỗi phải báo Backend (Thạc Duy Anh) trước.

Phiên bản: 0.1 · Cập nhật lần cuối: (điền ngày)

## Quy ước chung

- Base URL cục bộ: `http://localhost:7860` · Production: `https://<ten-space>.hf.space`
- Xác thực: header `x-api-key: <INTERNAL_API_KEY>`. Thiếu hoặc sai trả `401`.
- Content-Type: `application/json`, trừ endpoint ảnh dùng `multipart/form-data`.
- Backend PHẢI có fallback TypeScript cho mọi endpoint. Dịch vụ AI chết thì luồng học và ôn tập vẫn chạy.
- Space free ngủ sau ~48h không dùng: lần gọi đầu có thể mất 20–40 giây. Backend đặt timeout riêng cho lần gọi đầu.

## Mã lỗi

| Mã | Ý nghĩa | Backend nên làm gì |
|---|---|---|
| 200 | Thành công | — |
| 401 | Sai hoặc thiếu khoá nội bộ | Không retry, ghi log, cảnh báo DevOps |
| 413 | Đầu vào quá lớn (ảnh, số thẻ) | Báo người dùng, không retry |
| 422 | Dữ liệu sai miền giá trị | Lỗi lập trình, ghi log chi tiết |
| 503 | Mô hình chưa nạp xong | Retry một lần sau 2 giây, sau đó dùng fallback |
| timeout | Space đang ngủ hoặc quá tải | Dùng fallback ngay |

## GET /health

Không cần khoá. Dùng cho GitHub Actions giữ Space không ngủ.

```json
{ "status": "ok", "models": ["fsrs", "clip", "rag"] }
```

## POST /predict-retention

Dự báo khả năng nhớ và tính lịch ôn tập tiếp theo.

**Request** — tối đa 500 thẻ mỗi lần gọi.

```json
{
  "cards": [
    {
      "card_id": "uuid",
      "stability": 12.5,
      "difficulty": 5.2,
      "elapsed_days": 3.0,
      "rating": 3
    }
  ]
}
```

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| card_id | string | bắt buộc |
| stability | float | > 0, ≤ 36500 |
| difficulty | float | 1 ≤ d ≤ 10 |
| elapsed_days | float | ≥ 0 |
| rating | int | 1–4 (Again, Hard, Good, Easy) |

**Response**

```json
{
  "results": [
    {
      "card_id": "uuid",
      "retrievability": 0.8712,
      "new_stability": 18.34,
      "new_difficulty": 5.05,
      "interval_days": 12,
      "due_date": "2026-09-22"
    }
  ]
}
```

Ngưỡng mục tiêu là 0,9 — nghiêng về ôn sớm. Sai theo hướng ôn sớm chỉ tốn thời gian; sai theo hướng ôn muộn là người học quên.

**Fallback backend**: cài SM-2 bằng TypeScript, trả `interval_days` tương đương.

## POST /vision/detect

Nhận diện vật thể trong ảnh rồi tra sang từ vựng. Không phải OCR.

**Request**: `multipart/form-data`
- `image`: file ảnh, tối đa 5 MB, JPEG/PNG
- `user_cefr`: string, một trong `A1 A2 B1 B2 C1 C2`, mặc định `A2`
- `top_k`: int, 1–10, mặc định 8

**Response**

```json
{
  "results": [
    { "word": "keyboard", "ipa": "/ˈkiːbɔːd/", "meaning": "ban phim", "cefr": "A2", "confidence": 0.042 }
  ],
  "latency_ms": 380
}
```

Trả mảng rỗng khi không có nhãn nào vượt ngưỡng tin cậy — đây là hành vi đúng, không phải lỗi.

**Fallback backend**: báo người dùng chức năng tạm không khả dụng, gợi ý tra từ thủ công.

## POST /chat

Trợ lý hỏi đáp qua pipeline RAG 6 bước.

**Request**

```json
{ "question": "Khi nao dung present perfect?", "user_cefr": "B1", "history": [] }
```

- `question`: 1–500 ký tự
- `history`: tối đa 5 lượt gần nhất, mỗi lượt `{ "role": "user|assistant", "content": "..." }`

**Response**

```json
{
  "answer": "...",
  "intent": "grammar",
  "sources": [ { "chunk_id": "gr-014", "title": "Present perfect", "score": 0.81 } ],
  "used_llm": true
}
```

`sources` luôn phải có ít nhất một phần tử khi `answer` không rỗng. Câu trả lời không bám nguồn là lỗi cần ghi nhận.

**Fallback backend**: trả câu xin lỗi kèm liên kết tới trang học liệu tương ứng.
