# Hợp đồng API — ai-service ↔ backend NestJS

Đây là nguồn sự thật cho giao diện giữa dịch vụ AI và backend.
**Sửa file này TRƯỚC khi sửa code.** Mọi thay đổi trường, kiểu dữ liệu hoặc mã lỗi phải báo Backend (Thạc Duy Anh) trước.

Phiên bản: 0.2 · Cập nhật lần cuối: 2026-09-28 (WSEA-81)

## Quy ước chung

- Base URL cục bộ: `http://localhost:7860` · Production: `https://<ten-space>.hf.space`
- Xác thực: header `x-api-key: <INTERNAL_API_KEY>`. Thiếu hoặc sai trả `401`.
- Content-Type: `application/json`, trừ endpoint ảnh dùng `multipart/form-data`.
- Backend PHẢI có fallback TypeScript cho mọi endpoint. Dịch vụ AI chết thì luồng học và ôn tập vẫn chạy.
- Space free ngủ sau ~48h không dùng: lần gọi đầu có thể mất 20–40 giây. Backend đặt timeout riêng cho lần gọi đầu.
- **Body JSON không được chứa trường lạ.** Mọi schema đầu vào đặt `extra="forbid"`:
  gõ sai tên trường (`stabilty`) hoặc gửi camelCase (`elapsedDays`) đều trả `422`, không bị bỏ qua im lặng.
  Tên trường dùng `snake_case` đúng như bảng mô tả.
- **Không nhận `NaN` / `Infinity`** trong JSON (`allow_inf_nan=False`) — trả `422`.

## Mã lỗi

| Mã | Ý nghĩa | Backend nên làm gì |
|---|---|---|
| 200 | Thành công | — |
| 401 | Sai hoặc thiếu khoá nội bộ | Không retry, ghi log, cảnh báo DevOps |
| 413 | Đầu vào quá lớn (ảnh, số thẻ) | Báo người dùng, không retry |
| 422 | Dữ liệu sai miền giá trị, trường lạ, hoặc `NaN`/`Infinity` | Lỗi lập trình, ghi log chi tiết |
| 500 | Mô hình trả giá trị không hữu hạn hoặc lỗi bất ngờ | Dùng fallback ngay, ghi log, cảnh báo |
| 503 | Mô hình chưa nạp xong hoặc nạp thất bại | Retry một lần sau 2 giây, sau đó dùng fallback |
| timeout | Space đang ngủ hoặc quá tải | Dùng fallback ngay |

Nguyên tắc: **mọi 5xx đều là tín hiệu dùng fallback TypeScript** (NF-12).
Dịch vụ thà báo hỏng rõ ràng còn hơn trả số liệu sai để backend ghi vào lịch ôn của người học.

## GET /health

Không cần khoá. Dùng cho GitHub Actions giữ Space không ngủ.

Nạp mô hình thành công → **200**:

```json
{
  "status": "ok",
  "service": "web-study-english-ai-service",
  "version": "0.1.0",
  "environment": "production",
  "models": ["fsrs"],
  "model_version": "v1"
}
```

Nạp mô hình thất bại → **503**, body giữ nguyên hình dạng:

```json
{
  "status": "degraded",
  "models": [],
  "model_version": null
}
```

Trả 200 khi dịch vụ không phục vụ được là nói dối với health check — nên trạng thái
`degraded` đi kèm mã 503 để HF Spaces và GitHub Actions nhìn thấy đúng.

## POST /predict-retention

Dự báo khả năng nhớ và tính lịch ôn tập tiếp theo.

**Request** — từ 1 đến 500 thẻ mỗi lần gọi.

```json
{
  "cards": [
    {
      "card_id": "uuid",
      "stability": 12.5,
      "difficulty": 5.2,
      "elapsed_days": 3.0,
      "rating": 3
    },
    {
      "card_id": "the-moi",
      "stability": null,
      "difficulty": null,
      "elapsed_days": 0,
      "rating": 3
    }
  ]
}
```

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| card_id | string | bắt buộc, 1–64 ký tự |
| stability | float \| null | > 0, ≤ 36500 · `null` khi là thẻ mới |
| difficulty | float \| null | 1 ≤ d ≤ 10 · `null` khi là thẻ mới |
| elapsed_days | float | 0 ≤ t ≤ 36500 — số ngày kể từ lần ôn trước |
| rating | int | 1–4 (Again, Hard, Good, Easy) — điểm người học vừa chấm |

`cards`: `min_length=1`, `max_length=500`.

**`stability` và `difficulty` phải cùng có hoặc cùng vắng.** Gửi một cái mà thiếu cái
kia trả `422` — đó là dấu hiệu dữ liệu hỏng ở phía backend, dịch vụ không đoán thay.

**Thẻ mới** (`stability` và `difficulty` đều `null` hoặc vắng): mô hình khởi tạo
`S = w[rating-1]` và `D = D0(rating)` theo công thức FSRS 4.5. Backend không cần tự
cài công thức khởi tạo — làm vậy sẽ lệch với mô hình khi trọng số được huấn luyện lại.

**Response**

```json
{
  "results": [
    {
      "card_id": "uuid",
      "retrievability": 0.9730,
      "new_stability": 18.34,
      "new_difficulty": 5.05,
      "interval_days": 18
    },
    {
      "card_id": "the-moi",
      "retrievability": null,
      "new_stability": 2.71,
      "new_difficulty": 7.14,
      "interval_days": 3
    }
  ],
  "model_version": "v1"
}
```

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| card_id | string | đúng thứ tự như trong request |
| retrievability | float \| null | xác suất người học còn nhớ **ngay trước** lần ôn này. `null` với thẻ mới — chưa có lần ôn trước nên đại lượng này không tồn tại |
| new_stability | float | độ bền trí nhớ **sau** lần ôn này, 0,01–36500 |
| new_difficulty | float | độ khó sau lần ôn này, 1–10 |
| interval_days | int | số ngày tới lần ôn kế tiếp, ≥ 1 |
| model_version | string | phiên bản trọng số đang phục vụ (vd `v1`). Backend nên ghi log để đối chiếu khi số liệu đổi |

`retrievability` là `null` chứ không phải `1.0`: bịa một con số sẽ làm sai mọi thống kê
nếu backend gộp trung bình.

**`due_date` đã bị bỏ khỏi hợp đồng (v0.2).** Dịch vụ AI chỉ trả `interval_days`;
backend tự cộng vào ngày hiện tại theo múi giờ người học. Lý do: Space chạy UTC còn
người học ở GMT+7, để AI tính ngày thì chắc chắn lệch một ngày với người ôn buổi tối.

Ngưỡng mục tiêu là 0,9 — nghiêng về ôn sớm. Sai theo hướng ôn sớm chỉ tốn thời gian; sai theo hướng ôn muộn là người học quên.
Vì vậy `interval_days` **làm tròn** (`round`) chứ không làm tròn lên: `S' = 1,1` mà trả 2 ngày
thì tới hạn `R ≈ 0,84`, đã tụt dưới ngưỡng trước khi người học kịp ôn.

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
