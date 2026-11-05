# WSEA-141 — Tiêu chí đánh giá pipeline trợ lý (chốt trước khi chạy thật)

Chốt 2026-11-04, **trước** khi có dữ liệu và trước mọi lần chạy thật (bản đầu `dc4f402`; sửa cùng ngày, vẫn trước khi có dữ liệu: mục 4.2 chạy lại câu degraded, 4.3 câu dương bị chặn = sai, 4.3a cách báo, 4.3b lưu kết quả; sửa 2026-11-05, vẫn trước khi có dữ liệu: tách nhóm câu hỏi nghĩa từ `vocab` — mục 1, 2, 3, 4.1, 4.3; luật 127 theo 2 cấu hình — mục 3, hạn chế mục 5). Không sửa sau khi đã thấy kết quả; nếu buộc phải sửa thì ghi rõ ngày, lý do và commit cũ ở cuối file.

- **Không đổi** code `app/`, prompt (v2, WSEA-140) hay luật pipeline (WSEA-127) trong task này. Đây là đo, không phải chỉnh.
- Script: `scripts/run_eval_141.py` (test: `tests/test_run_eval_141.py`). Kết quả ghi vào `reports/`.
- Đây là **số chính thức** của pipeline trợ lý. 12 ca của WSEA-140 chỉ là bộ phát triển (DECISIONS WSEA-140 mục g).

## 1. Dữ liệu

- `kb/eval_set_141.csv` — câu dương: `qid,question,gold_ids,lang` (`gold_ids` nhiều id cách nhau `|`).
  - **Hai nhóm câu dương** (sửa 2026-11-05): `gold_ids` toàn dạng `word:<term>` → nhóm **`vocab`** (câu hỏi nghĩa từ, gold là từ vựng); toàn id đoạn (`gram_…`) → nhóm **`kb`**. Một câu trộn hai loại = lỗi dữ liệu. `<term>` so khớp không phân biệt hoa thường, phải có trong từ vựng (`backend/prisma/data/vocab_7000.csv`, cũng là các term trong `data/embeddings/words_e5-small.npz`).
- `kb/eval_set_141_neg.csv` — câu âm: `qid,question,group,lang`, `group` ∈ {`off`, `gap`} (`off` = lạc đề; `gap` = trong lĩnh vực nhưng kho chưa có).
- Người soạn: Phúc (60 câu). Claude/Hiếu **không sửa** file của Phúc; dữ liệu sai thì dừng và báo.
- Kiểm trước khi chạy (script tự kiểm, sai thì DỪNG): mọi `gold_id` đoạn có trong `kb/grammar_chunks.jsonl` (cùng nguồn `eval_retrieval.py` dùng); mọi `word:<term>` có trong từ vựng; mỗi câu đúng một nhóm; `qid` không trùng trong từng file và giữa hai file; câu không rỗng; `group`, `lang` đúng miền. Script in số câu mỗi file.
- **Trạng thái 2026-11-04**: hai file chưa có. Script đã chạy thử trên `kb/eval_questions.csv` + `kb/eval_negatives.csv` (bộ 31 + 12 cũ) — chỉ để kiểm script, **không phải kết quả**, không commit.

## 2. Truy hồi (0 lời gọi LLM)

- Cách đo giữ nguyên WSEA-111: vector đoạn đọc từ `.npz` đã nạp DB (kiểm manifest), câu hỏi mã hoá bằng `app/services/embedder.py` (`query: `), xếp hạng bằng `rank_all` của `scripts/eval_retrieval.py`. Câu hỏi gốc, không nối từ.
- **Báo hai nhóm riêng, không gộp.**
- **Nhóm `kb`**: tổng và theo `lang`, **hit@1, hit@5, hit@8, MRR@20** trên đoạn (hit@k = có ít nhất một gold trong top-k). Chỉ nhóm này đặt cạnh bộ 31 câu cũ.
- **Nhóm `vocab`**: **hit@3** = term gold nằm trong **top-3 `vocab` mà `/assistant/rank` chọn** (`select_vocab`: `exact` trước, rồi `vector` theo distance; K_VOCAB = 3), đo cho mọi câu, không phụ thuộc quyết định chặn (giống cách đo `kb` ở WSEA-127 mục c). Báo kèm số câu tìm thấy qua `exact` / qua `vector`, hạng của gold trong xếp hạng vector, và qid trượt.
  - `vocab` gửi đi dựng **đúng như backend** (đọc `backend/src/modules/assistant/assistant.service.ts`, 2026-11-05), `word` = null:
    - **exact**: `cauHoi.toLowerCase().match(/\b[a-z]{2,30}\b/g)` — `\b` của JS chỉ hiểu ASCII, nên chữ có dấu bị cắt mảnh ("hiện" → "hi", "dùng" → "ng"), mảnh 1 ký tự bị bỏ; tối đa 15 chuỗi khác nhau; `findMany({ where: term in …, take: 5 })` **không có ORDER BY** → thứ tự thật do Postgres; script **xấp xỉ** bằng thứ tự `rank` (thứ tự nạp seed). `match = "exact"`, `distance = 0`;
    - **vector**: top-3 trên `words_e5-small.npz` (vector đã nạp DB, câu hỏi gốc), `match = "vector"`;
    - trùng term → giữ `exact`; tối đa 10.
  - Hệ quả cần biết khi đọc số: câu có ≥ 3 từ `exact` (kể cả mảnh như "hi", "hay") thì từ tìm bằng vector không vào top-3.
  - Không có bộ cũ để so cho nhóm này.
- Báo phân bố **distance top-1** (đoạn; min / p50 / p90 / max) của câu dương `kb`, câu dương `vocab`, câu âm `off`, câu âm `gap`.
- **Không đặt ngưỡng đạt/trượt.** Đặt cạnh bộ 31 câu cũ để so (khác người soạn, khác câu, nên chỉ để tham khảo):

| chỉ số | 31 câu cũ (`docs/eval/retrieval_k_sweep.json`) |
|---|---|
| hit@1 | 0,613 |
| hit@5 | 0,839 |
| hit@8 | 0,871 |
| MRR@20 | 0,681 |

  Ghi chú: con số "MRR 0,678" hay được trích là MRR@8 (WSEA-110/126); MRR@20 của cùng bộ là 0,681.

## 3. Pipeline — luật WSEA-127 (0 lời gọi LLM)

- Mỗi câu → `AskRequest` với top-8 e5 (như backend, `AI_ASSISTANT_TOP_K` = 8), **`vocab` dựng như backend (mục 2)**, `word` null, `history` [] → `run_pipeline` thật (Embedder + IntentClassifier thật).
  - **Sửa 2026-11-05** (trước: `vocab` []): backend thật gửi `vocab` cho mọi câu; có từ `exact` thì luật 2 (ý định) và luật 3 (top-1 xa) được miễn. Chạy thử trên bộ 43 câu cũ (không phải kết quả): câu `off` bị chặn 3/7 (WSEA-127 đo với `vocab` [] là 5/7) — n05 "world cup", n07 "how do … apply for … student" có từ `exact` nên không bị chặn. Số mới phản ánh hệ thống thật, không so trực tiếp với WSEA-127.
- **Báo luật 127 theo 2 cấu hình** (sửa 2026-11-05, trước khi có dữ liệu):
  - **Chính** — `vocab` dựng như backend (mục 2). Đây là số chính thức của pipeline; **hit@k của cả hai nhóm và 20 câu sinh (mục 4) đều dùng cấu hình này**.
  - **Tham chiếu** — cùng câu, cùng top-8 đoạn, `vocab` [] (đúng cách đo WSEA-127). **Chỉ để so với WSEA-127**, không dùng cho phần nào khác. Mỗi câu chạy `run_pipeline` thêm một lần, không gọi LLM.
  - Báo hai cột cạnh nhau cho câu dương `kb`, câu dương `vocab`, câu `off`, câu `gap` (số bị chặn + qid), và bảng `decision` theo nhóm câu âm cho từng cấu hình (`pipeline` / `pipeline_ref` trong `141_retrieval.json`).
  - Kiểm script trên bộ 43 câu cũ (không phải kết quả): cấu hình tham chiếu ra đúng số WSEA-127 (dương 0/31, `off` 5/7, `gap` 1/5); cấu hình chính: dương 0/31, `off` 3/7, `gap` 1/5.
- Báo (chỉ ghi nhận, **không ngưỡng**): tỉ lệ câu dương bị chặn (`decision` ≠ `answer`), riêng nhóm `kb` và nhóm `vocab`; tỉ lệ câu `off` bị chặn; số câu `gap` bị chặn; bảng `decision` theo nhóm câu âm; danh sách qid bị chặn.
- `scripts/eval_default.py` là của bài dự báo quên, không dùng ở đây.

## 4. Phần sinh — 20 câu, Phúc chấm tay

### 4.1. Chọn câu (tất định, chốt trước)

- `random.Random(141)`, một bộ sinh duy nhất, gọi theo thứ tự cố định:
  1. **14 câu dương**, phân tầng theo **(nhóm `kb`/`vocab`, `lang`)** — khoá tầng `"<nhóm>|<lang>"` (sửa 2026-11-05; bộ không có nhóm `vocab` cho kết quả y như bản cũ): chia 14 theo tỉ lệ số câu của từng tầng (phần dư lớn nhất; hoà thì tên tầng tăng dần). Duyệt tầng theo tên tăng dần; trong mỗi tầng sắp `qid` tăng dần rồi `rng.sample`.
  2. **6 câu âm**, ưu tiên đủ cả `off` và `gap`: 3 `off` + 3 `gap`; nhóm nào thiếu câu thì bù từ nhóm kia. Duyệt `gap` rồi `off`; trong mỗi nhóm sắp `qid` rồi `rng.sample`.
- Danh sách qid do script tính và ghi vào `reports/141_retrieval.json` → `gen_selection.qids`. **Khi có dữ liệu, chép danh sách đó vào mục 4.4 dưới đây và commit TRƯỚC khi chạy `--gen`.**

### 4.2. Cách chạy

- Server local `uvicorn app.main:app --host 127.0.0.1 --port 8000` với `.env` thật (prompt v2 + hậu xử lý v3 như trên nhánh).
- Mỗi câu: top-8 như mục 3 → `POST /assistant/rank` (lấy `decision` của server) → `POST /assistant/ask` JSON. Ngủ 30 s sau mỗi câu có gọi LLM (Groq ~8K token/phút/model; mỗi câu ~3k token).
- Chạy **đủ 20 câu một lần**; `--limit` chỉ để chạy thử (`official: false`). Không chạy lại để chọn lần tốt hơn.
- **Câu `degraded` do lỗi hạ tầng** (429 / `rate_limited`, hết giờ, 5xx, mất kết nối): chạy lại **đúng 1 lần**, sau **≥ 60 s** kể từ lần lỗi, ghi rõ trong báo cáo (qid, lỗi lần đầu, thời điểm chạy lại, kết quả). Vẫn `degraded` → không chấm, báo số câu. Không chạy lại câu đã có câu trả lời, dù câu trả lời kém.
- **Phân loại `reason` của câu degraded** (script tự làm, sửa 2026-11-04 trước khi có dữ liệu): `rate_limited` / `timeout` / `upstream_error` = hạ tầng → chờ 60 s, chạy lại đúng 1 lần, ghi `retried` + `first_reason`; `empty_content` / `bad_response` = phía mô hình → KHÔNG chạy lại, báo riêng số câu; `no_key` = lỗi cấu hình → dừng cả lượt, không ghi kết quả nào. Cuối lượt in số câu chạy lại và số câu vẫn degraded theo `reason`.
- **Lớp regex backend (WSEA-143) không nằm trong phép đo**: script gọi thẳng dịch vụ AI, không qua backend, nên mọi số ở đây là của dịch vụ AI (pipeline 127 + LLM).
- Đầu ra: `reports/141_gen.json` (câu hỏi, `decision`, ngữ cảnh đã chọn kèm văn bản, `answer`, `source_ids`, `degraded`, độ trễ) và `reports/141_cham.csv` (`qid, question, nguon, answer, diem, ghi_chu`; `nguon` = toàn văn các đoạn được trích; hai cột cuối để trống cho Phúc).

### 4.3. Thang chấm (người chấm: Phúc, chấm tay)

Ghi vào cột `diem` một trong `dung` / `mot_phan` / `sai`, lý do ngắn ở `ghi_chu`.

- **Câu dương**:
  - `dung` — mọi khẳng định có trong đoạn nguồn, và trả lời đúng câu hỏi.
  - `mot_phan` — đúng nhưng thiếu ý chính; hoặc có ý không có trong nguồn nhưng không sai.
  - `sai` — có khẳng định trái với nguồn hoặc sai ngữ pháp; hoặc trả lời một câu lẽ ra phải từ chối.
- **Câu dương nhóm `vocab`**: "đoạn nguồn" = các **mục từ vựng** `/rank` đưa vào prompt (term, từ loại, nghĩa, ví dụ — cột `nguon` của `141_cham.csv` ghi dạng `[word:<term>] …`) cùng các đoạn được trích; thang `dung` / `mot_phan` / `sai` như câu dương.
- **Câu dương bị pipeline chặn** (`decision` ≠ `answer`, không có câu trả lời của LLM) → `sai`, ghi chú "chặn nhầm".
- **Câu âm**: `dung` = từ chối đúng (trả câu "ngoài phạm vi" cho `off`, câu "kho chưa có" cho `gap`, hoặc bị chặn trước LLM); trả lời nội dung thay vì từ chối = `sai`.
- **Phân vân giữa hai mức → chọn mức thấp hơn.**
- Câu `degraded` sau lần chạy lại (mục 4.2) không chấm, báo riêng số câu.

### 4.3a. Cách báo (sửa 2026-11-04, trước khi có dữ liệu)

- **Tỉ lệ trung thực** = số `dung` / số câu **có câu trả lời do LLM sinh** (pipeline cho qua, `decision = answer`, và `answer` KHÔNG phải nguyên văn một câu cố định). Câu bị chặn, câu LLM tự từ chối bằng câu cố định, câu `degraded` **không** vào mẫu số. Báo kèm `mot_phan`, `sai` trên cùng mẫu số.
- **Câu dương bị chặn nhầm** (pipeline hoặc LLM từ chối): báo riêng, đã tính `sai` theo mục 4.3; vì không phải câu do LLM sinh nên KHÔNG vào tỉ lệ trung thực, nhưng phải nêu cạnh tỉ lệ đó.
- **Tỉ lệ từ chối đúng** (câu âm): báo riêng, kèm **lớp chặn** của từng câu:
  - `regex backend` — guardrail của backend (WSEA-143). Lần chạy này gọi thẳng dịch vụ AI, **không qua backend**, nên lớp này không quan sát được và luôn ghi 0; muốn đo phải chạy qua backend;
  - `pipeline 127` — `decision` ≠ `answer` (`/assistant/rank`);
  - `LLM` — `decision = answer` và `answer` là nguyên văn câu cố định.
- Không có ngưỡng đạt ở task này; so với NF-15 (độ trung thực ≥ 90%) chỉ để thảo luận trong báo cáo, ghi rõ n.

### 4.3b. Lưu kết quả

- `reports/` chỉ chứa kết quả **chạy thật**, commit vào git: `141_retrieval.json`, `141_gen.json`, `141_cham.csv` (bản **sau khi Phúc chấm**). Không để file chạy thử (`--limit`, bộ câu cũ) trong `reports/`; chạy thử dùng `--out-dir` ngoài repo.

### 4.4. Danh sách 20 qid

(chưa có — điền từ `gen_selection.qids` khi có `kb/eval_set_141*.csv`, commit trước khi chạy `--gen`)

## 5. Hạn chế đã biết

- **Lỗi regex của backend cắt chữ tiếng Việt có dấu** (đo NGUYÊN TRẠNG, không sửa trong WSEA-141): `/\b[a-z]{2,30}\b/g` của JS coi chữ có dấu là ranh giới từ, nên "hiện" → `hi`, "dùng" → `ng`, "thời" → `th`; mảnh nào trùng từ tiếng Anh trong bảng `words` thành `vocab` `exact`. Hệ quả: (1) câu có từ `exact` được miễn luật 2 và 3 của WSEA-127, nên cấu hình chính chặn ít câu lạc đề hơn cấu hình tham chiếu; (2) câu có ≥ 3 từ `exact` đẩy từ tìm bằng vector ra khỏi top-3, làm giảm hit@3 nhóm `vocab`. Sửa là việc của backend (báo Duy Anh), ngoài phạm vi task này; số của 141 phản ánh hệ thống đang chạy.
- Thứ tự 5 từ `exact` của backend không xác định (`findMany` không có ORDER BY); script xấp xỉ theo `rank`.

- n nhỏ (60 câu truy hồi, 20 câu sinh): một câu ≈ 1,7–5 điểm phần trăm.
- Một lần chạy sinh, temperature 0,2: câu trả lời còn dao động giữa các lần gọi (thấy ở WSEA-140 B4).
- Chạy trên laptop → Groq; độ trễ không đại diện cho Space CPU basic.
- Rủi ro bịa quy tắc (WSEA-140, d05 affect/effect ở v1 và v3) — phần sinh là nơi đo rủi ro này.
