# WSEA-141 — Tiêu chí đánh giá pipeline trợ lý (chốt trước khi chạy thật)

Chốt 2026-11-04, **trước** khi có dữ liệu và trước mọi lần chạy thật (bản đầu `dc4f402`; sửa cùng ngày, vẫn trước khi có dữ liệu: mục 4.2 chạy lại câu degraded, 4.3 câu dương bị chặn = sai, 4.3a cách báo, 4.3b lưu kết quả). Không sửa sau khi đã thấy kết quả; nếu buộc phải sửa thì ghi rõ ngày, lý do và commit cũ ở cuối file.

- **Không đổi** code `app/`, prompt (v2, WSEA-140) hay luật pipeline (WSEA-127) trong task này. Đây là đo, không phải chỉnh.
- Script: `scripts/run_eval_141.py` (test: `tests/test_run_eval_141.py`). Kết quả ghi vào `reports/`.
- Đây là **số chính thức** của pipeline trợ lý. 12 ca của WSEA-140 chỉ là bộ phát triển (DECISIONS WSEA-140 mục g).

## 1. Dữ liệu

- `kb/eval_set_141.csv` — câu dương: `qid,question,gold_ids,lang` (`gold_ids` nhiều id cách nhau `|`).
- `kb/eval_set_141_neg.csv` — câu âm: `qid,question,group,lang`, `group` ∈ {`off`, `gap`} (`off` = lạc đề; `gap` = trong lĩnh vực nhưng kho chưa có).
- Người soạn: Phúc (60 câu). Claude/Hiếu **không sửa** file của Phúc; dữ liệu sai thì dừng và báo.
- Kiểm trước khi chạy (script tự kiểm, sai thì DỪNG): mọi `gold_id` có trong `kb/grammar_chunks.jsonl` (cùng nguồn `eval_retrieval.py` dùng); `qid` không trùng trong từng file và giữa hai file; câu không rỗng; `group`, `lang` đúng miền. Script in số câu mỗi file.
- **Trạng thái 2026-11-04**: hai file chưa có. Script đã chạy thử trên `kb/eval_questions.csv` + `kb/eval_negatives.csv` (bộ 31 + 12 cũ) — chỉ để kiểm script, **không phải kết quả**, không commit.

## 2. Truy hồi (0 lời gọi LLM)

- Cách đo giữ nguyên WSEA-111: vector đoạn đọc từ `.npz` đã nạp DB (kiểm manifest), câu hỏi mã hoá bằng `app/services/embedder.py` (`query: `), xếp hạng bằng `rank_all` của `scripts/eval_retrieval.py`. Câu hỏi gốc, không nối từ.
- Báo trên câu dương, tổng và theo `lang`: **hit@1, hit@5, hit@8, MRR@20** (hit@k = có ít nhất một gold trong top-k).
- Báo phân bố **distance top-1** (min / p50 / p90 / max) của câu dương, câu âm `off`, câu âm `gap`.
- **Không đặt ngưỡng đạt/trượt.** Đặt cạnh bộ 31 câu cũ để so (khác người soạn, khác câu, nên chỉ để tham khảo):

| chỉ số | 31 câu cũ (`docs/eval/retrieval_k_sweep.json`) |
|---|---|
| hit@1 | 0,613 |
| hit@5 | 0,839 |
| hit@8 | 0,871 |
| MRR@20 | 0,681 |

  Ghi chú: con số "MRR 0,678" hay được trích là MRR@8 (WSEA-110/126); MRR@20 của cùng bộ là 0,681.

## 3. Pipeline — luật WSEA-127 (0 lời gọi LLM)

- Mỗi câu → `AskRequest` với top-8 e5 (như backend, `AI_ASSISTANT_TOP_K` = 8), `word` null, `vocab` [], `history` [] → `run_pipeline` thật (Embedder + IntentClassifier thật), cùng logic `scripts/check_pipeline.py`.
- Báo (chỉ ghi nhận, **không ngưỡng**): tỉ lệ câu dương bị chặn (`decision` ≠ `answer`); tỉ lệ câu `off` bị chặn; số câu `gap` bị chặn; bảng `decision` theo nhóm câu âm; danh sách qid bị chặn.
- `scripts/eval_default.py` là của bài dự báo quên, không dùng ở đây.

## 4. Phần sinh — 20 câu, Phúc chấm tay

### 4.1. Chọn câu (tất định, chốt trước)

- `random.Random(141)`, một bộ sinh duy nhất, gọi theo thứ tự cố định:
  1. **14 câu dương**, phân tầng theo `lang`: chia 14 theo tỉ lệ số câu của từng `lang` (phần dư lớn nhất; hoà thì tên `lang` tăng dần). Duyệt `lang` theo tên tăng dần; trong mỗi tầng sắp `qid` tăng dần rồi `rng.sample`.
  2. **6 câu âm**, ưu tiên đủ cả `off` và `gap`: 3 `off` + 3 `gap`; nhóm nào thiếu câu thì bù từ nhóm kia. Duyệt `gap` rồi `off`; trong mỗi nhóm sắp `qid` rồi `rng.sample`.
- Danh sách qid do script tính và ghi vào `reports/141_retrieval.json` → `gen_selection.qids`. **Khi có dữ liệu, chép danh sách đó vào mục 4.4 dưới đây và commit TRƯỚC khi chạy `--gen`.**

### 4.2. Cách chạy

- Server local `uvicorn app.main:app --host 127.0.0.1 --port 8000` với `.env` thật (prompt v2 + hậu xử lý v3 như trên nhánh).
- Mỗi câu: top-8 như mục 3 → `POST /assistant/rank` (lấy `decision` của server) → `POST /assistant/ask` JSON. Ngủ 30 s sau mỗi câu có gọi LLM (Groq ~8K token/phút/model; mỗi câu ~3k token).
- Chạy **đủ 20 câu một lần**; `--limit` chỉ để chạy thử (`official: false`). Không chạy lại để chọn lần tốt hơn.
- **Câu `degraded` do lỗi hạ tầng** (429 / `rate_limited`, hết giờ, 5xx, mất kết nối): chạy lại **đúng 1 lần**, sau **≥ 60 s** kể từ lần lỗi, ghi rõ trong báo cáo (qid, lỗi lần đầu, thời điểm chạy lại, kết quả). Vẫn `degraded` → không chấm, báo số câu. Không chạy lại câu đã có câu trả lời, dù câu trả lời kém. (Script hiện chưa tự chạy lại; làm bằng tay hoặc bổ sung script trước khi chạy thật — mọi thay đổi script commit trước lần chạy.)
- Đầu ra: `reports/141_gen.json` (câu hỏi, `decision`, ngữ cảnh đã chọn kèm văn bản, `answer`, `source_ids`, `degraded`, độ trễ) và `reports/141_cham.csv` (`qid, question, nguon, answer, diem, ghi_chu`; `nguon` = toàn văn các đoạn được trích; hai cột cuối để trống cho Phúc).

### 4.3. Thang chấm (người chấm: Phúc, chấm tay)

Ghi vào cột `diem` một trong `dung` / `mot_phan` / `sai`, lý do ngắn ở `ghi_chu`.

- **Câu dương**:
  - `dung` — mọi khẳng định có trong đoạn nguồn, và trả lời đúng câu hỏi.
  - `mot_phan` — đúng nhưng thiếu ý chính; hoặc có ý không có trong nguồn nhưng không sai.
  - `sai` — có khẳng định trái với nguồn hoặc sai ngữ pháp; hoặc trả lời một câu lẽ ra phải từ chối.
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

- n nhỏ (60 câu truy hồi, 20 câu sinh): một câu ≈ 1,7–5 điểm phần trăm.
- Một lần chạy sinh, temperature 0,2: câu trả lời còn dao động giữa các lần gọi (thấy ở WSEA-140 B4).
- Chạy trên laptop → Groq; độ trễ không đại diện cho Space CPU basic.
- Rủi ro bịa quy tắc (WSEA-140, d05 affect/effect ở v1 và v3) — phần sinh là nơi đo rủi ro này.
