# Kho tri thức ngữ pháp (WSEA-100)

Kho tri thức ngữ pháp mà trợ lý AI dùng để truy hồi ngữ nghĩa (RAG). Thư mục này chỉ chứa
**dữ liệu đầu vào**. Dữ liệu được nạp vào bảng `kb_chunks` của từng môi trường (local, staging,
production) bằng một script viết sau (WSEA-93, sinh vector và nạp). Không sửa trực tiếp trong
cơ sở dữ liệu: sửa file ở đây rồi nạp lại.

> Thư mục tên `kb/` chứ không phải `data/` vì `.gitignore` chặn `data/` (dữ liệu thô không đưa lên git).

**Từ vựng không nằm ở đây.** Nguồn từ vựng là `backend/prisma/data/vocab_7000.csv`.

## Các file

| File | Vai trò |
|---|---|
| `README.md` | Đặc tả kho tri thức (file này) |
| `sources.md` | Danh sách nguồn tham chiếu và giấy phép |
| `outline.csv` | Dàn ý 100 đoạn: `id,topic,facet,title,cefr,source_url` |
| `grammar_chunks.jsonl` | **File chính.** Mỗi dòng một đoạn tri thức hoàn chỉnh (viết ở bước sau) |

## Định dạng `grammar_chunks.jsonl`

Mã hoá UTF-8, mỗi dòng là một JSON object, không có dòng trống:

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `id` | string | có | `gram_001` … `gram_100`, khớp `outline.csv`, duy nhất |
| `topic` | string | có | Chủ đề, snake_case tiếng Anh. Ví dụ `present_perfect`, `confusable_make_do` |
| `facet` | string | có | Một trong `form` · `usage` · `signals` · `contrast` · `mistakes` |
| `title` | string | có | Tiêu đề đầy đủ, giống dòng đầu của `content` |
| `cefr` | string | có | Một trong `A1` · `A2` · `B1` · `B2` (enum `CefrLevel` bên backend chỉ có 4 bậc này) |
| `source` | string | có | Dạng `WSEA biên soạn · tham chiếu: <tên nguồn>` |
| `source_url` | string | có | URL trang đã dùng để đối chiếu |
| `content` | string | có | Nội dung đoạn, dòng đầu là tiêu đề, xuống dòng bằng `\n` |
| `reviewed_by` | string \| null | có | Tên người đã duyệt; `null` khi chưa duyệt |

Ý nghĩa `facet`:

| facet | Nội dung |
|---|---|
| `form` | Cấu trúc, công thức, cách thành lập |
| `usage` | Khi nào dùng, dùng để diễn đạt gì |
| `signals` | Dấu hiệu nhận biết (trạng từ, cụm thời gian…) |
| `contrast` | Phân biệt hai hay nhiều cấu trúc/từ dễ nhầm |
| `mistakes` | Lỗi người Việt hay mắc và cách sửa |

Ví dụ một dòng (rút gọn `content`):

```json
{"id": "gram_013", "topic": "present_perfect", "facet": "usage", "title": "Thì hiện tại hoàn thành (Present Perfect) — Cách dùng", "cefr": "B1", "source": "WSEA biên soạn · tham chiếu: Wikipedia — Present perfect", "source_url": "https://en.wikipedia.org/wiki/Present_perfect", "content": "Thì hiện tại hoàn thành (Present Perfect) — Cách dùng\nThì hiện tại hoàn thành nối quá khứ với hiện tại...", "reviewed_by": null}
```

## Ánh xạ sang bảng `kb_chunks`

| Trường trong file | Cột `kb_chunks` | Ghi chú |
|---|---|---|
| `id` | `id` | Cột kiểu `String`, mặc định uuid; ở đây dùng `gram_xxx` để nạp lại không bị trùng |
| `content` | `content` | |
| `source` | `source` | |
| `topic` | `topic` | |
| `cefr` | `cefr` | Enum `CefrLevel` |
| — | `embedding` | Sinh lúc nạp, `vector(768)` |
| `facet`, `title`, `source_url`, `reviewed_by` | — | Chỉ có trong file, dùng để biên soạn và kiểm duyệt |

## 8 yêu cầu với mỗi đoạn

1. **Một chủ đề × một khía cạnh**, tự đứng được: đọc riêng vẫn hiểu, không viết "như đã nói ở trên",
   "xem đoạn trước".
2. **Dòng đầu `content` là tiêu đề đầy đủ**, ví dụ `Thì hiện tại hoàn thành (Present Perfect) — Cách dùng`.
   Tiêu đề lặp lại tên chủ đề để vector của đoạn mang đúng ngữ cảnh.
3. **Độ dài 120–250 từ** (tính cả tiêu đề và ví dụ).
4. **Giải thích bằng tiếng Việt**; nếu `facet = form` phải có công thức (ví dụ `S + have/has + V3`);
   có **ít nhất 2 ví dụ tiếng Anh kèm bản dịch** tiếng Việt.
5. **Đủ siêu dữ liệu**: không trường nào thiếu; `facet`, `cefr` đúng giá trị cho phép.
6. **Đã đối chiếu** với trang ở `source_url` và có `reviewed_by` (khác `null`) trước khi nạp lên production.
7. **Không chép nguyên văn** nguồn có bản quyền. Với nguồn CC BY-SA vẫn viết lại bằng lời của nhóm
   và ghi nguồn ở `source`.
8. **Mỗi cặp `(topic, facet)` là duy nhất** trong toàn bộ file.

## Quy ước định dạng `content`

Viết đúng khuôn dưới đây để `scripts/validate_kb.py` kiểm được tự động:

- **Dòng 1** đúng bằng `title`.
- **Facet `form`** phải có một dòng bắt đầu bằng `Công thức:`.
- Có một dòng đúng `Ví dụ:`, sau đó **ít nhất 2 dòng** dạng `- <câu tiếng Anh> (<bản dịch tiếng Việt>)`.
  Bản dịch nằm trong cặp ngoặc cuối dòng, trong bản dịch không dùng thêm ngoặc.
- Không dùng các cụm trỏ về đoạn khác: `như đã nói`, `đã nêu ở trên`, `nói ở trên`, `ở phần trên`,
  `đoạn trước`, `phần trước` (không phân biệt hoa thường). `ở trên` đứng riêng vẫn dùng được,
  ví dụ câu dịch `Quyển sách ở trên bàn.`

```
Thì hiện tại hoàn thành (Present Perfect) — Cấu trúc
Công thức: S + have/has + V3 (khẳng định); S + have/has + not + V3 (phủ định).
<giải thích bằng tiếng Việt…>
Ví dụ:
- I have lived here for ten years. (Tôi đã sống ở đây mười năm.)
- She has already finished her homework. (Cô ấy đã làm xong bài tập rồi.)
```

Trong file JSONL, xuống dòng viết là `\n`. Ghi bằng `json.dumps(obj, ensure_ascii=False)` để
tiếng Việt giữ nguyên dấu.

## Kiểm tra: `scripts/validate_kb.py`

```
python scripts/validate_kb.py            # đang viết theo lô
python scripts/validate_kb.py --final    # trước khi nạp
```

| | Mặc định (đang viết) | `--final` |
|---|---|---|
| id trong outline chưa viết | thông tin | **lỗi** |
| `reviewed_by` null | cảnh báo | **lỗi** |
| không nạp được tokenizer | in `bỏ qua đo token` | **lỗi** `không đo được token` (trừ khi thêm `--no-tokens`) |

- **Lỗi** (exit code 1): JSON hỏng; thiếu hoặc thừa trường (phải đúng 9 trường); id sai dạng
  `gram_\d{3}` hoặc không có trong outline; topic/facet/title/cefr/source_url khác outline;
  facet hoặc cefr ngoài tập cho phép; trùng id; trùng (topic, facet); dòng 1 khác title; số từ
  ngoài 120–250; facet form thiếu `Công thức:`; ít hơn 2 ví dụ đúng dạng; source sai tiền tố;
  source_url không phải https; có cụm cấm; hai đoạn trùng hệt nhau (sau khi đổi chữ thường và
  gộp khoảng trắng); quá 512 token.
- **Cảnh báo**: chưa duyệt; trên 480 token. Đếm token bằng tokenizer `intfloat/multilingual-e5-small`
  trên chuỗi `"passage: " + content`, chỉ khi cài `transformers`; nếu không cài thì in `bỏ qua đo token`.
- **Độ giống**: TF-IDF ký tự (`char_wb`, 3–5) trên content, in 10 cặp giống nhất để người duyệt xem.
  Không làm script thất bại. Cần `scikit-learn` (có trong `requirements-dev.txt`).
- **Đầu ra**: `kb/report.json` (đếm theo cefr/facet, số từ, token, lỗi, cảnh báo, cặp giống nhất)
  và `kb/preview.md` (nhóm theo topic, có ô `- [ ] Đã duyệt` để duyệt từng đoạn).

## Quy ước `source`

```
WSEA biên soạn · tham chiếu: <tên nguồn>
```

Ví dụ: `WSEA biên soạn · tham chiếu: Wikipedia — English conditional sentences`,
`WSEA biên soạn · tham chiếu: Wiktionary — lend (usage notes)`.
Tên nguồn lấy từ bảng trong `sources.md`.
