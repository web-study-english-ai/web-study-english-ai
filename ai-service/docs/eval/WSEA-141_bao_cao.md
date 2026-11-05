# WSEA-141 — Báo cáo đánh giá pipeline trợ lý (RAG)

- **Tiêu chí** (chốt trước khi chạy): `docs/eval/WSEA-141_tieu_chi.md`. Không đổi code `app/`, prompt v2 hay luật WSEA-127 trong task này.
- **Dữ liệu**: `kb/eval_set_141.csv` (40 câu dương: 25 `kb` + 15 `vocab`; vi 21, en 19) và `kb/eval_set_141_neg.csv` (20 câu âm: 10 `off` + 10 `gap`), commit `6b134d6`.
- **Kết quả gốc**: `reports/141_retrieval.json` (chạy 2026-11-05 03:54 UTC, commit `528de91`), `reports/141_gen.json` (chạy 04:56 UTC, `official: true`, commit `9aa33a0`), `reports/141_cham.csv` (điểm chấm tay).
- **Hệ thống đo**: e5-small, top-8 đoạn, K_PROMPT 5; luật pipeline ở `a52466d`; LLM Groq `openai/gpt-oss-120b`, prompt v2 + hậu xử lý v3 (WSEA-140), server uvicorn local trên laptop.
- **Người chấm phần sinh**: Claude chấm, Hiếu duyệt (tiêu chí ghi người chấm là Phúc; đổi theo quyết định của Hiếu).

## 1. Truy hồi (0 lời gọi LLM)

Nhóm `kb` — gold là đoạn ngữ pháp; nhóm `vocab` — gold là từ (`word:<term>`), đo hit@3 trên top-3 `vocab` mà `/assistant/rank` chọn, `vocab` dựng như backend. Bộ 31 câu cũ chỉ để tham khảo (khác người soạn, khác câu).

| chỉ số | bộ 141 — `kb` (n = 25) | `kb` vi (n = 13) | `kb` en (n = 12) | 31 câu cũ (WSEA-111) |
|---|---|---|---|---|
| hit@1 | 0,680 | 0,615 | 0,750 | 0,613 |
| hit@5 | 0,920 | 0,846 | 1,000 | 0,839 |
| hit@8 | 1,000 | 1,000 | 1,000 | 0,871 |
| MRR@20 | 0,799 | 0,729 | 0,875 | 0,681 |
| **hit@3 nhóm `vocab`** (n = 15) | **13/15 = 0,867** (vi 8/8, en 5/7); cả 13 câu tìm thấy qua `exact`, 0 qua `vector` | | | — (không có nhóm này) |

- Hai câu `vocab` trượt (q033 "repeat", q035 "device"): từ gold có trong danh sách `exact` nhưng xếp thứ 5, sau các từ khung câu (`mean`, `question`, `please` / `part`, `list`), nên không vào top-3. Thứ tự này là xấp xỉ (xem mục 5).
- distance top-1 (đoạn), p50: dương `kb` 0,137 · dương `vocab` 0,172 · âm `gap` 0,156 · âm `off` 0,217.

## 2. Luật WSEA-127 — hai cấu hình (0 lời gọi LLM)

Số câu bị chặn (`decision` ≠ `answer`). **Chính** = `vocab` như backend (số chính thức). **Tham chiếu** = `vocab` [] như WSEA-127, chỉ để so.

| nhóm | n | chính | tham chiếu |
|---|---|---|---|
| dương `kb` | 25 | 0 | 0 |
| dương `vocab` | 15 | 0 | 1 (q027) |
| âm `off` | 10 | **3** (q051, q057, q059) | **6** (q051, q055, q056, q057, q058, q059) |
| âm `gap` | 10 | 0 | 0 |

- Cấu hình chính chặn ít câu lạc đề hơn: câu có từ khớp `exact` (kể cả mảnh do lỗi regex, mục 5) được miễn luật ý định và luật top-1 xa. Câu `gap` không bị chặn ở cả hai cấu hình (đúng thiết kế WSEA-127: để LLM từ chối).
- Không chặn nhầm câu dương nào ở cấu hình chính.

## 3. Sinh câu trả lời — 20 câu (seed 141)

Chạy đúng 1 lần. **0 câu chạy lại, 0 câu `degraded`.** 19 câu tới LLM; q059 bị pipeline chặn trước LLM.

| | n | dung | mot_phan | sai |
|---|---|---|---|---|
| Câu dương `kb` | 9 | 5 | 2 | 2 (q002, q016) |
| Câu dương `vocab` | 5 | 4 | 0 | 1 (q035 — từ chối nhầm) |
| **Câu dương (tổng)** | **14** | **9** | **2** | **3** |
| Câu âm | 6 | 6 | 0 | 0 |

**Tỉ lệ trung thực** (tiêu chí 4.3a — mẫu số = câu có câu trả lời do LLM sinh, không gồm câu bị chặn hay câu cố định):

| mẫu số | dung | mot_phan | sai | tỉ lệ trung thực |
|---|---|---|---|---|
| 13 câu dương LLM trả lời nội dung | 9 | 2 | 2 | **9/13 = 69,2 %** |

- **Câu dương bị từ chối nhầm** (báo cạnh, không vào mẫu số): 1 — q035, LLM trả câu "kho chưa có" vì `vocab` trượt top-3 (chấm `sai`, ghi chú "từ chối nhầm"). Pipeline không chặn nhầm câu dương nào.
- Câu âm không có câu trả lời nội dung nào do LLM sinh, nên không vào mẫu số.
- So với NF-15 (≥ 90 %): 69,2 % thấp hơn, **n = 13**, chỉ để thảo luận (tiêu chí không đặt ngưỡng).

**Từ chối đúng (câu âm) theo lớp chặn:**

| nhóm | n | từ chối đúng | regex backend | pipeline 127 | LLM |
|---|---|---|---|---|---|
| `off` | 3 | 3 | — (không đo) | 1 (q059) | 2 (q056, q058) |
| `gap` | 3 | 3 | — (không đo) | 0 | 3 (q044, q045, q047) |
| **tổng** | **6** | **6/6** | — | 1 | 5 |

- Lớp regex backend (WSEA-143) không nằm trong phép đo: script gọi thẳng dịch vụ AI.
- **Lệch so với chữ của tiêu chí 4.3**: tiêu chí ghi câu `gap` đúng khi trả câu "kho chưa có", nhưng cả 3 câu `gap` trả câu "ngoài phạm vi". Người chấm vẫn chấm `dung` (đã từ chối, không bịa) và ghi chú điều này. Nếu đọc theo chữ của tiêu chí, `gap` chỉ 0/3 dùng đúng câu cố định; dù vậy không câu nào trả lời nội dung.

## 4. Các câu `sai` và `mot_phan`

| qid | nhóm | điểm | lý do (ghi chú người chấm) |
|---|---|---|---|
| q002 | `kb` | sai | Công thức V-s/es đúng, nhưng "has cho động từ to be" trái nguồn (he/she/it đi với is; has là của have); ví dụ dịch hỏng ("He works" → "Cô ấy works", "Trời rains often"). |
| q016 | `kb` | sai | Kết luận "lượng từ thường dùng với danh từ không đếm được là all" sai so với câu hỏi (much, little, a little, some, a lot of); chỉ truy được gram_030, không dùng gold gram_027/023. |
| q035 | `vocab` | sai | Câu dương nhưng trả "kho chưa có" do `vocab` trượt (top-3: mean, part, list). Không bịa, nhưng không trả lời. |
| q005 | `kb` | mot_phan | Công thức đúng nhưng trích gram_005 (cách dùng) — đoạn này không chứa công thức; trích nguồn sai. |
| q009 | `kb` | mot_phan | Did not + V nguyên mẫu đúng nhưng trích gram_009 (cách dùng) không chứa dạng phủ định; câu "dựa trên tài liệu" không đúng với nguồn trích. |

- q002 và q016 là cùng kiểu lỗi đã thấy ở WSEA-140 (d05): mô hình khẳng định điều tài liệu không nói và gán cho tài liệu.
- q005, q009: nội dung đúng nhưng trích sai đoạn — `source_ids` không đáng tin như bằng chứng cho từng ý.
- q035: hệ quả trực tiếp của lỗi ở bước dựng `vocab` (mục 5), không phải lỗi của LLM.

## 5. Hạn chế

- **n nhỏ**: 20 câu sinh (13 câu vào tỉ lệ trung thực — một câu ≈ 7,7 điểm %), 40 câu dương truy hồi, 20 câu âm.
- **1 lần chạy**, temperature 0,2: câu trả lời còn dao động giữa các lần gọi (thấy ở WSEA-140).
- **1 người chấm** (Claude, Hiếu duyệt), không có người chấm độc lập thứ hai cho bộ này.
- **Gold q001–q025 do nhóm AI gán**, không phải Phúc — nhóm `kb` có thể thiên về cách nhóm AI hiểu kho đoạn.
- **Lỗi regex backend cắt chữ Việt có dấu** (đo nguyên trạng, không sửa trong WSEA-141): `/\b[a-z]{2,30}\b/g` của JS coi chữ có dấu là ranh giới từ ("hiện" → `hi`, "dùng" → `ng`). Hệ quả: câu có từ `exact` được miễn luật 2/3 (cấu hình chính chặn `off` 3/10 so với 6/10), và từ khung câu chiếm chỗ trong top-3 `vocab`. Sửa là việc của backend.
- **Thứ tự `exact` không xác định**: backend lấy 5 từ khớp bằng `findMany` không có ORDER BY; script xấp xỉ theo `rank`. Hai câu `vocab` trượt (q033, q035) phụ thuộc vào phép xấp xỉ này — trên hệ thống thật có thể trúng hoặc trượt.
- **Bộ 141 dễ hơn bộ 31 câu**: nhiều câu nêu thẳng tên điểm ngữ pháp hoặc từ cần hỏi (vd "thì hiện tại đơn (Present Simple)", "Từ “colleague” có nghĩa là gì?"), trong khi bộ 31 diễn đạt gián tiếp. hit@8 = 1,000 và MRR cao hơn không có nghĩa truy hồi đã tốt hơn; không so trực tiếp hai bộ.
- Độ trễ đo từ laptop → Groq, không đại diện cho Space CPU basic.
