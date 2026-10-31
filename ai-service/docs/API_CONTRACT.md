# Hợp đồng API — ai-service ↔ backend NestJS

Đây là nguồn sự thật cho giao diện giữa dịch vụ AI và backend.
**Sửa file này TRƯỚC khi sửa code.** Mọi thay đổi trường, kiểu dữ liệu hoặc mã lỗi phải báo Backend (Thạc Duy Anh) trước.

Phiên bản: 0.3 · Cập nhật lần cuối: 2026-10-31 (WSEA-111): `POST /assistant/embed` đã triển khai; `GET /health` có thể liệt kê `"embedder"` trong `models` — **không đổi giao diện** · 2026-10-31 (WSEA-110): thay mục `POST /chat` (chưa từng triển khai) bằng `POST /assistant/embed` + `POST /assistant/ask`, chốt với Duy Anh 2026-10-30 · Bản 0.2: 2026-09-28 (WSEA-81) · 2026-10-17 và 2026-10-19: chỉ sửa phần triển khai (HF Spaces → Render → quay lại HF Spaces), **không đổi giao diện** · 2026-10-22 (WSEA-97): thêm header `Server-Timing` ở response 200 của `POST /predict-retention` — tương thích ngược, body và mã lỗi không đổi

## Quy ước chung

- Base URL cục bộ: `http://localhost:7860` · Production: `https://hieusss-wsea-ai-service.hf.space` (HF Spaces `Hieusss/wsea-ai-service`, đã xác nhận 2026-10-20 — smoke test 7/7, Jira WSEA-82)
- Xác thực: header `x-api-key: <INTERNAL_API_KEY>`. Thiếu hoặc sai trả `401`.
- Content-Type: `application/json`, trừ endpoint ảnh dùng `multipart/form-data`.
- Backend PHẢI có fallback TypeScript cho mọi endpoint. Dịch vụ AI chết thì luồng học và ôn tập vẫn chạy.
- Dịch vụ chạy trên HF Spaces (Docker, CPU basic). Space **ngủ sau 48 giờ** không có request, và **khởi động lại** khi được đẩy bản mới, khi sửa Settings hoặc khi HF bảo trì; trong lúc đó request lỗi hoặc treo → fallback như bình thường. Một lần gọi `GET /health` mỗi ngày giữ Space không ngủ. Backend timeout 3 giây mọi lần gọi; `503` thì thử lại một lần sau 2 giây rồi fallback (chốt với Duy Anh 2026-10-09).
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
| timeout | Quá tải, đang deploy lại hoặc mất mạng | Dùng fallback ngay |

Nguyên tắc: **mọi 5xx đều là tín hiệu dùng fallback TypeScript** (NF-12).
Dịch vụ thà báo hỏng rõ ràng còn hơn trả số liệu sai để backend ghi vào lịch ôn của người học.

## GET /health

Không cần khoá. Dùng cho job ping giữ thức, smoke test và kiểm tra thủ công. HF Spaces không có health check cấu hình được: Space báo "Running" ngay khi cổng 7860 mở, kể cả khi mô hình nạp thất bại → phải kiểm endpoint này trả 200.

Nạp mô hình thành công → **200**:

```json
{
  "status": "ok",
  "service": "web-study-english-ai-service",
  "version": "0.1.0",
  "environment": "production",
  "models": ["fsrs", "embedder"],
  "model_version": "v1"
}
```

- `models` liệt kê mọi mô hình đã nạp: `"fsrs"` và, từ WSEA-111, `"embedder"` (mô hình vector của `/assistant/embed`).
- Trạng thái `503` / `degraded` **chỉ phụ thuộc `fsrs`**. Embedder nạp thất bại thì `/health` vẫn `200` với `models: ["fsrs"]`; riêng `/assistant/embed` trả `503` và backend fallback.

Nạp mô hình dự báo (`fsrs`) thất bại → **503**, body giữ nguyên hình dạng:

```json
{
  "status": "degraded",
  "models": [],
  "model_version": null
}
```

Trả 200 khi dịch vụ không phục vụ được là nói dối với health check — nên trạng thái
`degraded` đi kèm mã 503 để job ping và smoke test nhìn thấy đúng.

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
backend tự cộng vào ngày hiện tại theo múi giờ người học. Lý do: máy chủ chạy UTC còn
người học ở GMT+7, để AI tính ngày thì chắc chắn lệch một ngày với người ôn buổi tối.

Ngưỡng mục tiêu là 0,9 — nghiêng về ôn sớm. Sai theo hướng ôn sớm chỉ tốn thời gian; sai theo hướng ôn muộn là người học quên.
Vì vậy `interval_days` **làm tròn** (`round`) chứ không làm tròn lên: `S' = 1,1` mà trả 2 ngày
thì tới hạn `R ≈ 0,84`, đã tụt dưới ngưỡng trước khi người học kịp ôn.

**Header `Server-Timing`** (từ 2026-10-22, WSEA-97) — chỉ có ở response `200`,
theo chuẩn W3C Server Timing:

```
Server-Timing: tensor;dur=0.028, model;dur=0.262, check;dur=0.056, build;dur=0.011, app;dur=0.584
```

| Tên | Đo phần nào |
|---|---|
| tensor | gom lô thẻ thành tensor |
| model | mô hình tính R, S', D', khoảng ôn |
| check | kiểm tra đầu ra không có NaN/Inf |
| build | đổi tensor về danh sách kết quả |
| app | tổng thời gian trong ứng dụng, gồm cả nhận body, kiểm tra đầu vào và tạo JSON trả về |

Đơn vị ms, số thực ≥ 0, thứ tự cố định như bảng. Header **chỉ để chẩn đoán** (tách thời
gian máy chủ khỏi thời gian mạng): backend **không bắt buộc đọc**, không được dựa vào nó để
quyết định nghiệp vụ. Body JSON không đổi. Response `401`/`422`/`500`/`503` không có header này.

**Fallback backend**: `simple-scheduler.ts` (TypeScript), trả `interval_days` tương đương. Không phải SM-2 — xem `docs/DECISIONS.md` mục 2026-10-11.

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

## Trợ lý hỏi đáp — kiến trúc (v0.3, chốt với Thạc Duy Anh 2026-10-30, Jira WSEA-110)

> Thay mục `POST /chat` của v0.2 (chưa từng triển khai). Kiến trúc: **backend sở hữu cơ sở dữ liệu và chạy truy vấn pgvector; dịch vụ AI không kết nối DB, không giữ trạng thái**, nên một HF Space dùng chung được cho local, staging và production (`docs/DECISIONS.md` mục 2026-10-29).
>
> Quy ước chung ở đầu file vẫn giữ: header `x-api-key`, `snake_case`, `extra="forbid"` (trường lạ → `422`), không nhận `NaN`/`Infinity`.

```
Người học ──▶ Backend
               │ 1. POST /assistant/embed {text}            ──▶ AI: trả vector 384 chiều
               │ 2. SQL pgvector trên DB của môi trường mình  (kb_chunks + word_embeddings, words)
               │ 3. POST /assistant/ask {question, contexts, vocab, ...} ──▶ AI: rerank (nếu có) + prompt + LLM
               ▼
            Trả lời (JSON hoặc SSE) + nguồn
```

## POST /assistant/embed

Sinh vector cho câu hỏi để backend tìm đoạn tri thức gần nhất.

**Request**

```json
{ "text": "khi nào dùng hiện tại hoàn thành thay vì quá khứ đơn" }
```

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `text` | string | có | 1–1000 ký tự sau khi bỏ khoảng trắng hai đầu |

- Gửi **câu hỏi gốc** của người học. Nếu đang hỏi về một từ cụ thể (`wordId`), nối thêm từ đó ở cuối: `"<câu hỏi> (<term>)"`. KHÔNG gửi chuỗi `[Từ đang học: …]`.
- Backend **KHÔNG** tự thêm tiền tố `query: ` và KHÔNG tự chuẩn hoá vector. Dịch vụ AI làm việc này bằng đúng module đã dùng để nạp vector (`app/services/embedder.py`), nên lúc nạp và lúc truy vấn không thể lệch nhau.

**Response 200**

```json
{
  "embedding": [0.0123, -0.0456, "... đủ 384 số ..."],
  "model": "intfloat/multilingual-e5-small",
  "revision": "614241f622f53c4eeff9890bdc4f31cfecc418b3",
  "dim": 384
}
```

- `embedding`: 384 số thực, đã chuẩn hoá L2 (độ dài bằng 1).
- **Backend phải kiểm** `dim === 384` và `model === AI_EMBED_MODEL`. Lệch thì không truy vấn, xử lý như lỗi → fallback.

**Lỗi**: `401` · `422` (rỗng, quá 1000 ký tự, trường lạ) · `503` (mô hình chưa nạp xong) · `500`.
**Timeout backend**: 5 giây (`AI_EMBED_TIMEOUT_MS`). `503` → thử lại 1 lần sau 2 giây rồi fallback.
**Trạng thái**: đã triển khai trên Space 2026-10-31 (WSEA-111). Đo: phía server ~20 ms, khứ hồi từ VN 497–630 ms.

## Truy vấn pgvector phía backend (tham khảo — backend sở hữu)

```sql
-- Đoạn tri thức: top-8 ứng viên
SELECT id, content, source, topic, cefr::text AS cefr,
       (embedding <=> $1::vector) AS distance
FROM kb_chunks
WHERE embedding IS NOT NULL
  AND embedding_model = $2
ORDER BY embedding <=> $1::vector
LIMIT 8;

-- Từ vựng (tra ngược Việt → Anh): top-3. LẤY TOP-K TRƯỚC RỒI MỚI JOIN words
SELECT w.term, w.pos::text AS pos, w.meaning_vi, w.example_en, t.distance
FROM (
    SELECT word_id, (embedding <=> $1::vector) AS distance
    FROM word_embeddings
    WHERE model = $2
    ORDER BY embedding <=> $1::vector
    LIMIT 3
) t
JOIN words w ON w.id = t.word_id
ORDER BY t.distance;
```

- `$1` là chuỗi `'[0.0123,-0.0456,...]'` truyền qua `$queryRaw`; `$2` là `AI_EMBED_MODEL`. Lọc theo `embedding_model` / `model` để chỉ dùng vector sinh bằng đúng mô hình đang chạy.
- `ORDER BY` phải dùng đúng biểu thức `embedding <=> $1::vector` thì Postgres mới dùng được chỉ mục HNSW.
- Đo trên staging 2026-10-31: viết `JOIN words` rồi mới `LIMIT` có lúc chậm (p50 2–13 ms, đỉnh 80 ms); dạng truy vấn con ở trên ổn định p50 0,89 ms, tối đa 1,2 ms.
- Nếu thêm điều kiện lọc (ví dụ theo `cefr`), chạy `SET LOCAL hnsw.iterative_scan = relaxed_order;` trong cùng transaction (pgvector 0.8.2) để vẫn lấy đủ k dòng.
- `distance` là khoảng cách cosine: 0 = giống hệt, càng nhỏ càng gần (e5-small: đa số 0,08–0,21). **Backend không tự đặt ngưỡng loại bỏ**; ngưỡng "không đủ ngữ cảnh" do dịch vụ AI quyết định.
- (Nên có) **Tra chính xác**: các từ tiếng Anh trong câu hỏi (chuỗi a–z, viết thường) → `SELECT … FROM words WHERE term = ANY($1)` → đưa vào `vocab` với `match: "exact"`, `distance: 0`.

## POST /assistant/ask

Sinh câu trả lời từ các đoạn ngữ cảnh do backend gửi kèm. Cùng một URL phục vụ JSON và SSE, chọn bằng header `Accept`.

**Request**

```json
{
  "question": "khi nào dùng hiện tại hoàn thành thay vì quá khứ đơn",
  "word": { "term": "already", "pos": "adv", "meaning_vi": "đã, rồi" },
  "user_cefr": "B1",
  "contexts": [
    {
      "id": "gram_015",
      "content": "Hiện tại hoàn thành và quá khứ đơn — Phân biệt\n...",
      "source": "WSEA biên soạn · tham chiếu: Wikipedia — Present perfect",
      "topic": "present_perfect",
      "cefr": "B1",
      "distance": 0.086
    }
  ],
  "vocab": [
    { "term": "already", "pos": "adv", "meaning_vi": "đã, rồi", "example_en": "I have already finished.", "match": "exact", "distance": 0.0 }
  ],
  "history": [
    { "role": "user", "content": "thì hiện tại hoàn thành là gì" },
    { "role": "assistant", "content": "..." }
  ]
}
```

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `question` | string | có | 1–1000 ký tự. Câu gốc, không nối ngữ cảnh |
| `word` | object \| null | không | `term` 1–100 ký tự, `pos`, `meaning_vi`. Thay cho `word_id` (AI không có DB để tra id) |
| `user_cefr` | `"A1"`…`"B2"` \| null | không | Điều chỉnh độ khó của lời giải thích |
| `contexts` | mảng | có (được rỗng) | 0–20 phần tử, sắp theo `distance` tăng dần, `id` không trùng; `content` ≤ 4000 ký tự; `distance` trong [0, 2] |
| `vocab` | mảng | không, mặc định `[]` | 0–10 phần tử; `match` là `"exact"` hoặc `"vector"`; `example_en` có thể null |
| `history` | mảng | không, mặc định `[]` | 0–6 lượt gần nhất, `role` là `"user"` hoặc `"assistant"`, `content` ≤ 2000 ký tự |

- Backend gửi khoảng 8 ứng viên (`AI_ASSISTANT_TOP_K`, tối đa 20). Dịch vụ AI được phép xếp lại (rerank) và cắt bớt trước khi đưa vào prompt.

**Response 200 — JSON** (`Accept: application/json`)

```json
{ "answer": "Dùng hiện tại hoàn thành khi ...", "source_ids": ["gram_015", "gram_013"] }
```

- `source_ids` ⊂ `contexts[].id`, xếp theo mức độ đã dùng. Bằng `[]` khi câu trả lời không dựa trên đoạn nào; khi đó `answer` phải nói rõ là trong kho chưa có tài liệu cho câu hỏi này.
- Backend vẫn lọc lại `source_ids` theo các id đã gửi.
- Từ v0.3 chỉ dùng `source_ids` (bỏ dạng `sources: [{source_id}]` của khung cũ).

**Response 200 — SSE** (`Accept: text/event-stream`, cùng URL)

```
data: {"delta": "Thì hiện tại"}

data: {"delta": " hoàn thành dùng khi ..."}

data: {"answer": "<toàn văn câu trả lời>", "source_ids": ["gram_015"]}

data: [DONE]

```

- Khung cuối luôn có `answer` (toàn văn) và `source_ids`, rồi tới `[DONE]`.
- Backend chỉ coi là **thành công khi nhận được khung cuối**. Luồng đứt trước khung cuối → `degraded = true` và trả kèm 3 nguồn đầu đã truy hồi (Duy Anh chốt 2026-10-30).
- Lỗi xảy ra trước khung đầu tiên thì trả mã HTTP như bảng lỗi; đã bắt đầu luồng rồi thì AI chỉ có thể đóng luồng.

**Lỗi**: `401` · `422` · `503` (không gọi được LLM, hết hạn mức) · `500`.
**Timeout backend**: 15 giây (JSON) / 45 giây (SSE), như hiện tại.

## Fallback trợ lý phía backend

| Hỏng ở đâu | Backend làm gì |
|---|---|
| `/assistant/embed` lỗi hoặc timeout, hoặc `dim`/`model` lệch | Không truy hồi; trả câu dự phòng, `degraded = true` |
| SQL pgvector lỗi | Như trên |
| `/assistant/ask` lỗi, timeout, hoặc SSE đứt trước khung cuối | Câu dự phòng **kèm 3 nguồn đầu đã truy hồi được** (tiêu đề + link nguồn), `degraded = true` |

## Biến môi trường mới phía backend (trợ lý)

| Biến | Giá trị mặc định | Ghi chú |
|---|---|---|
| `AI_EMBED_MODEL` | `intfloat/multilingual-e5-small` | Phải khớp `kb_chunks.embedding_model` và `word_embeddings.model` |
| `AI_EMBED_TIMEOUT_MS` | `5000` | Timeout riêng cho `/assistant/embed` |
| `AI_ASSISTANT_TOP_K` | `8` | Số đoạn ứng viên gửi sang `/assistant/ask` (tối đa 20) |
