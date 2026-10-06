# PROGRESS.md — Nhật ký mảng AI · Web Study English AI

> File sống. Claude đọc ở đầu phiên và cập nhật ở cuối phiên.
> Đi kèm: `CLAUDE.md` (luật chơi), `TASKS.md` (33 công việc AI theo 12 đợt), `docs/API_CONTRACT.md`, `docs/DECISIONS.md`.
> Nguyên tắc: ghi **ngắn, cụ thể, có mã task**. Ghi cả việc thất bại — đó là tư liệu cho báo cáo.
> Mục mới thêm lên **đầu** mỗi bảng/danh sách.

---

## 1. Trạng thái hiện tại

- **Đợt hiện tại:** Đợt 5 (D13–D15) — Triển khai dịch vụ AI
- **Task đang làm:** WSEA-81 — Xây dựng endpoint dự báo trong dịch vụ AI ✅ xong
- **Nhánh:** `ai/WSEA-81-xay-dung-endpoint`
- **Việc dở dang cần làm tiếp:**
  - Báo Thạc Duy Anh hợp đồng API lên 0.2 (bỏ `due_date`, S/D nullable, `extra="forbid"`, header `x-api-key`, khoá sai 401) **trước khi backend tích hợp**
  - WSEA-65: đưa lên HF Spaces, kiểm tra `huggingface_hub` tải được trọng số trong container
  - **Nợ từ đợt 4**: WSEA-50 chưa làm — chưa có SM-2 baseline nên AUC 0.695 chưa so được với gì (vi phạm quy tắc 8)
- **Đang bị chặn bởi:** không
- **Cập nhật lần cuối:** 2026-09-28

## 2. Tiến độ theo mốc

| Mốc | Đợt | Điều kiện AI | Trạng thái | Ghi chú |
|---|---|---|---|---|
| — | 1 | Dataset đã tải, kiến trúc AI Service đã chốt | ⬜ | |
| — | 2 | EDA xong, chia tập theo user có assert, khung FastAPI chạy | ⬜ | |
| — | 3 | Cài đặt DSR 17 tham số + unit test pass | ✅ | `app/models/fsrs.py`, test toán học pass |
| MK-2 | 4 | Bảng `reviews` ghi đủ 16 trường mô hình cần | ⬜ | Phối hợp Phúc, Bình |
| v0.1 | 4 | Mô hình DSR đã huấn luyện, có số liệu so với SM-2 | ⚠️ | Đã train (val log-loss 0.4510) nhưng **chưa có SM-2 để so** — WSEA-50 |
| — | 5 | AI Service trên HF Spaces, `/predict-retention` gọi được từ backend | 🟨 | Endpoint xong, chạy cục bộ với trọng số v1 (WSEA-81); chưa lên Spaces (WSEA-65) |
| MK-3 / v1.0 | 6 | **Dự báo quên đúng trên production — SỐNG CÒN** | ⬜ | |
| — | 7 | Chunk + embedding + vector search chạy | ⬜ | |
| — | 8 | Phân loại ý định + rerank đạt mục tiêu | ⬜ | |
| v1.1 | 9 | Trợ lý RAG trên production | ⬜ | |
| MK-4 / v1.2 | 10 | CLIP nhận diện ảnh; đủ 3 chức năng AI | ⬜ | |
| MK-5 | 10 | Đóng băng tính năng | ⬜ | |

Ký hiệu: ⬜ chưa làm · 🟨 đang làm · ✅ xong · ⚠️ trễ/có vấn đề · ✂️ đã cắt

## 3. Quyết định đã chốt

> **Nếu bạn đã dùng `docs/DECISIONS.md` thì chuyển bảng này sang đó và để lại một dòng trỏ link,
> tránh hai nơi cùng ghi quyết định rồi lệch nhau.**
> Chỉ sửa khi có lý do rõ ràng. Ghi cả phương án bị loại để bảo vệ trước giảng viên.

| Ngày | Quyết định | Lý do | Phương án đã loại |
|---|---|---|---|
| (khởi tạo) | Tự cài đặt DSR 17 tham số bằng PyTorch, không dùng thư viện FSRS có sẵn | Thể hiện năng lực tự xây AI; hiểu được từng công thức khi bảo vệ | Gọi thư viện `fsrs` / `fsrs-optimizer` |
| (khởi tạo) | Dataset FSRS-Anki-20k, chia tập theo người dùng | Dữ liệu thật, nhiều người dùng; chia theo user mới đo được khả năng tổng quát | Tự sinh dữ liệu; chia ngẫu nhiên theo dòng (rò rỉ) |
| (khởi tạo) | Nhận diện ảnh bằng CLIP zero-shot tự host | Không cần dữ liệu huấn luyện, không tốn phí API | Fine-tune CNN (thiếu dữ liệu, thời gian); gọi Vision API ngoài |
| (khởi tạo) | Nhận diện vật thể → tra NGSL, không làm OCR | Đúng mục tiêu học từ vựng qua đồ vật xung quanh | OCR |
| (khởi tạo) | RAG: e5-small + pgvector HNSW; chỉ khâu sinh dùng Gemini | Nhẹ, chạy CPU, đa ngôn ngữ; 5/6 bước tự xây | Dùng API embedding; vector DB riêng (Pinecone...) |
| (khởi tạo) | Frontend không gọi thẳng AI; backend có fallback TS | Bảo mật khoá nội bộ; app vẫn học được khi AI sập (NF-12) | Gọi thẳng từ frontend |

## 4. Vấn đề mở và rủi ro

> Mỗi vấn đề: mức độ (Rất cao / Cao / TB / Thấp), người xử lý, hạn. Mức **Cao trở lên sửa ngay trong đợt**.

| # | Vấn đề | Mức | Người xử lý | Hạn | Trạng thái |
|---|---|---|---|---|---|
| 11 | **Hợp đồng API đổi lên 0.2, backend chưa được báo.** Đổi: path `/predict/forgetting` → `/predict-retention`; header `X-Internal-Api-Key` → `x-api-key`; khoá sai 403 → 401; bỏ `due_date`; `stability`/`difficulty` nhận `null`; thêm `extra="forbid"` (trường lạ hoặc camelCase → 422); thêm mã 500. Backend gọi theo bản cũ sẽ hỏng ngay. | Rất cao | Hiếu → Duy Anh | Trước WSEA-65 | Mở |
| 10 | **Đánh số WSEA trong `TASKS.md` lệch với Jira thật.** Task "Xây dựng endpoint" ghi WSEA-64 nhưng Jira là WSEA-81; commit trước đó dùng WSEA-66 cho "huấn luyện mô hình" trong khi `TASKS.md` ghi WSEA-66 = "kiểm thử tích hợp". Cần rà toàn bộ file, nếu không minh chứng Jira sẽ gắn nhầm task. | Cao | Hiếu | Đợt 5 | Mở |
| 1 | **Thứ tự cắt giảm không thống nhất giữa các tài liệu.** Bối cảnh dự án ghi: Could have → đọc hiểu → bỏ rerank → bỏ phân loại ý định → giảm nhãn ảnh 2000→500. File 11 (sheet Mốc và bàn giao) ghi: cắt **toàn bộ** nhận diện ảnh trước tiên, rồi phân loại ý định + rerank. MK-3 cũng ghi "huỷ nhận diện ảnh nếu mô hình dự báo lỗi". Cần chốt một bản và sửa tài liệu còn lại. | Cao | Hiếu | Đợt __ | Mở |
| 2 | **SM-2 không tự sinh xác suất nhớ.** Muốn so log-loss/AUC với DSR phải định nghĩa cách quy đổi (vd dùng khoảng ôn SM-2 làm S rồi áp cùng công thức R(t,S), hoặc hàm mũ `0.9^(t/I)`). Chọn một cách, ghi rõ trong báo cáo. | Cao | Hiếu | Trước khi đánh giá | Mở |
| 3 | Chưa chốt mô hình **rerank** và **phân loại ý định** (vd cross-encoder nhỏ; e5 embedding + LogisticRegression). Cần ước RAM trên HF Spaces CPU. | TB | Hiếu | Đợt 7 | Mở |
| 4 | Tổng RAM khi nạp cùng lúc DSR + CLIP + e5 (+ reranker) trên Spaces miễn phí — chưa đo. | TB | Hiếu | Đợt 5 | Mở |
| 5 | Cold start của HF Spaces làm request đầu chậm/timeout → backend cần timeout + fallback. Thống nhất timeout với Duy Anh. | TB | Hiếu, Duy Anh | Đợt 5 | Mở |
| 6 | 40.007 file CSV — huấn luyện toàn bộ có thể quá nặng. Có thể lấy mẫu một tập user; phải ghi rõ số user từng tập. | TB | Hiếu | Đợt 2 | Mở |
| 7 | Khoá nội bộ dùng header `x-api-key` (theo CLAUDE.md). Xác nhận đúng tên header và tên biến môi trường với Duy Anh, ghi vào `docs/API_CONTRACT.md`. | Thấp | Hiếu, Duy Anh | Đợt 5 | Mở |
| 8 | Kế hoạch AI (đợt 7) ghi "so sánh vài mô hình sinh vector" nhưng bối cảnh đã chốt e5-small. Nếu vẫn so sánh thì chỉ so 2 mô hình, hộp thời gian 2h, rồi chốt. | Thấp | Hiếu | Đợt 7 | Mở |
| 9 | Số câu đánh giá RAG không khớp: SRS NF-15 ghi 30 câu chấm tay, kế hoạch AI đợt 9 ghi 60 câu. Chốt một con số (đề xuất: 30 câu chấm độ trung thực + 60 câu đo Recall@k/MRR). | Thấp | Hiếu | Đợt 9 | Mở |

## 5. Ghi chú dữ liệu

> Mọi phát hiện khi EDA và cách xử lý. Đây là nguồn viết chương "Dữ liệu" của báo cáo.

- **Nguồn:** `open-spaced-repetition/FSRS-Anki-20k` — gated, cần HF token; giấy phép: ______
- **Số file thực tế tải được:** ______ · **Số user dùng:** train ___ / val ___ / test ___ · seed = ___
- **File danh sách user từng tập:** `training/splits/*.txt`
- Lần ôn đầu có `elapsed_days` = ______ → xử lý: ______
- Ôn cùng ngày (`elapsed_days = 0`): ______ bản ghi → xử lý: ______
- `rating` ngoài 1–4: ______ → xử lý: ______
- Tỷ lệ nhãn quên (`rating == 1`): ______%
- Biểu đồ EDA lưu tại: `outputs/eda/`

## 6. Nhật ký thí nghiệm

> Mỗi lần chạy có số liệu đáng ghi. Chỉ điền cột Test khi đánh giá cuối cùng.

### 6.1. Dự báo quên

Tất cả chạy trên cùng tập kiểm định: **n = 735.540** lượt ôn, tỷ lệ nhớ nền 0,8254, seed = 42,
50 epoch, dừng sớm patience = 5. Chia tập **theo `user_id`** (quy tắc 1).
Cột Test vẫn trống — **tập test chưa được mở**, đúng quy tắc 2.

| Ngày | Run | Mô hình | Cấu hình chính | Log-loss (val) | RMSE-bins (val) | AUC (val) | Test | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| — | — | **SM-2 (baseline)** | — | — | — | — | — | ⚠️ **CHƯA CÀI** — WSEA-50. Không có baseline thì mọi số dưới đây chưa nói lên điều gì (quy tắc 8) |
| — | — | Dự đoán hằng số | p = 0,8254 | — | — | 0,5 | — | Cũng chưa tính. Đây là mốc rẻ nhất để biết mô hình có hơn "đoán bừa" không |
| 2026-09-27 | `final_lr004` | **DSR đã train** | lr=0,04 · bs=512 | **0,4510** | **0,0751** | **0,6954** | — | ✅ **Tốt nhất — đã đẩy lên Hub tag `v1`, đang chạy trên endpoint** |
| 2026-09-27 | `exp03_lr001` / `final_lr001` | DSR đã train | lr=0,01 · bs=512 | 0,4519 | 0,0769 | 0,6960 | — | AUC nhỉnh hơn chút nhưng log-loss và hiệu chỉnh kém hơn |
| 2026-09-27 | `final_lr01` | DSR đã train | lr=0,1 · bs=512 | 0,4558 | 0,0762 | 0,6844 | — | lr quá lớn, hội tụ kém |
| 2026-09-27 | `final_lr0002_b2048` | DSR đã train | lr=0,002 · bs=2048 | 0,4558 | 0,0795 | 0,6937 | — | lr nhỏ + batch to: hiệu chỉnh tệ nhất nhóm |
| 2026-09-27 | `exp02_lr02` | DSR đã train | lr=0,2 · bs=512 | 0,4578 | 0,0762 | 0,6825 | — | Kém nhất |
| 2026-09-26 | `smoke` | DSR (chạy thử) | dữ liệu giả, n=1.036 | 0,7707 | 0,1861 | 0,5065 | — | Chỉ để kiểm tra vòng huấn luyện chạy được |

**Đọc bảng này thế nào:** khoảng cách giữa run tốt nhất và kém nhất chỉ 0,0068 log-loss —
tức chỉnh learning rate gần như không đổi được kết quả. Điều đó gợi ý giới hạn nằm ở
**dạng mô hình hoặc đặc trưng**, không ở tối ưu hoá. AUC ~0,695 nghĩa là mô hình phân biệt
nhớ/quên tốt hơn ngẫu nhiên nhưng còn xa mức chắc chắn.
Chưa có SM-2 nên **chưa kết luận được** con số này là tốt hay tệ.

### 6.2. Nhận diện ảnh (50 ảnh tự chụp)

| Ngày | Mô hình CLIP | Số nhãn | Prompt template | Top-1 | Top-5 | Latency TB (ms) | Ghi chú |
|---|---|---|---|---|---|---|---|

### 6.3. Trợ lý RAG

| Ngày | Cấu hình (chunk size, top-k, rerank?, intent?) | Recall@k | Độ trung thực (30 câu) | Acc. phân loại ý định | Latency TB | Ghi chú |
|---|---|---|---|---|---|---|

## 7. Lỗi đã gặp và cách sửa

> Để lần sau (và thành viên khác) không mất thời gian lại. Ghi triệu chứng → nguyên nhân → cách sửa.

| Ngày | Triệu chứng | Nguyên nhân | Cách sửa | Task |
|---|---|---|---|---|
| 2026-09-28 | Mọi request có header khoá trả **500** thay vì 403/401 | Commit `a95872c` đổi `deps.py` sang gọi `.get_secret_value()` nhưng `config.py` vẫn khai `internal_api_key: str` → `AttributeError`. Không có test endpoint nào nên không ai phát hiện | Đổi sang `SecretStr` (`Field(min_length=32)`); thêm test ca "sai khoá → 401" để khoá lại | WSEA-81 |
| 2026-09-28 | Gửi `NaN` trong JSON trả **500** thay vì 422 | FastAPI 0.115.6 nhét giá trị người dùng vào trường `input` của body lỗi; `NaN` không serialize được nên chính body lỗi làm văng 500 | Thêm `exception_handler` cho `RequestValidationError` trong `main.py`, chỉ trả `loc`/`msg`/`type`. Kèm `allow_inf_nan=False` ở schema | WSEA-81 |
| 2026-09-28 | Gõ sai tên trường (`stabilty`) hoặc camelCase (`elapsedDays`) trả **200 với kết quả sai** | Pydantic mặc định bỏ qua trường lạ → thẻ cũ bị coi là thẻ mới, trả khoảng ôn hoàn toàn khác mà không báo gì | `extra="forbid"` cho mọi schema đầu vào; thêm test cho cả hai trường hợp | WSEA-81 |
| 2026-09-28 | Test `subprocess` kiểm tra import bị `OSError [WinError 10106]` | Truyền `env={"PATH":"", "SYSTEMROOT":""}` làm Windows không nạp được DLL mạng mà `torch` cần | Giữ nguyên `os.environ`, chỉ loại đúng biến cần thử | WSEA-81 |
| (khởi tạo) | `hf_hub_download` báo 401/403 với dataset gated dù đã login | Không nhận token ngầm trong môi trường đó | Truyền `token=tok` trực tiếp vào `hf_hub_download` | — |

## 8. Thay đổi hợp đồng API với backend

| Ngày | Endpoint | Thay đổi | Đã báo Duy Anh? | Commit |
|---|---|---|---|---|
| 2026-09-28 | `POST /predict-retention` | Đường dẫn đổi từ `/predict/forgetting` (code cũ lệch hợp đồng) | ❌ **CHƯA** | WSEA-81 |
| 2026-09-28 | tất cả | Header đổi `X-Internal-Api-Key` → `x-api-key`; khoá sai `403` → `401` | ❌ **CHƯA** | WSEA-81 |
| 2026-09-28 | `POST /predict-retention` | **Bỏ `due_date`** — backend tự cộng ngày theo múi giờ người học | ❌ **CHƯA** | WSEA-81 |
| 2026-09-28 | `POST /predict-retention` | `stability`/`difficulty` nhận `null` cho thẻ mới; `retrievability` trả `null` khi đó | ❌ **CHƯA** | WSEA-81 |
| 2026-09-28 | `POST /predict-retention` | Thêm `model_version` vào response | ❌ **CHƯA** | WSEA-81 |
| 2026-09-28 | tất cả | `extra="forbid"`: trường lạ / camelCase → 422. `NaN`/`Infinity` → 422 | ❌ **CHƯA** | WSEA-81 |
| 2026-09-28 | tất cả | Thêm mã **500** (mô hình trả giá trị không hữu hạn) — backend fallback với mọi 5xx | ❌ **CHƯA** | WSEA-81 |
| 2026-09-28 | `GET /health` | Thêm `models`, `model_version`; trả **503** khi `status="degraded"` | ❌ **CHƯA** | WSEA-81 |

## 9. Nhật ký phiên làm việc

> Mỗi phiên một mục, mới nhất ở trên. 3–6 dòng là đủ.

### 2026-09-28 · Đợt 5 · WSEA-81 — Xây dựng endpoint dự báo

- **Đã làm:** `POST /predict-retention` xử lý theo lô ≤ 500 thẻ; `app/models/weights.py` nạp trọng số v1 từ HF Hub trong `lifespan`; `FSRSModel.predict_step` cho suy luận một bước; sửa hợp đồng API lên 0.2 **trước** khi sửa code.
- **Kết quả / số liệu:** `pytest -q` **107 pass** (27 cũ + 80 mới), độ phủ `app/` **98%**. Chạy thật với trọng số `v1`: thẻ S=12,5 t=3 → R = 0,97299 (khớp công thức tính tay 0,973), S' = 25,72, khoảng ôn 26 ngày. Lô 2 thẻ mất **1,9 ms**. Thẻ mới → `retrievability: null`, S' = 0,50538 = đúng `w[0]` của v1.
- **Ba lỗi tìm được và sửa** (chi tiết ở mục 7):
  1. Commit `a95872c` làm mọi request có khoá trả **500** — `config.py` khai `str` còn `deps.py` gọi `.get_secret_value()`. Không có test endpoint nên lỗi nằm im.
  2. Gửi `NaN` trả **500** thay vì 422 — lỗi nằm ở chính body lỗi của FastAPI.
  3. Gõ sai tên trường trả **200 với kết quả sai** — thẻ cũ bị coi là thẻ mới.
- **Vấn đề mới:** đã thêm vào mục 4 — (#11) hợp đồng API đổi mà backend chưa được báo, (#10) đánh số WSEA trong `TASKS.md` lệch với Jira.
- **Minh chứng Jira:** nhánh `ai/WSEA-81-xay-dung-endpoint`; ảnh `pytest -q` 107 pass; `docs/API_CONTRACT.md` v0.2; 5 quyết định mới trong `docs/DECISIONS.md`; trọng số https://huggingface.co/Hieusss/wsea-fsrs-weights/tree/v1
- **Việc tiếp theo:** (1) **báo Duy Anh hợp đồng 0.2 ngay** — backend gọi theo bản cũ sẽ hỏng; (2) WSEA-65 lên HF Spaces; (3) trả nợ WSEA-50 (SM-2 baseline) — chưa có nó thì AUC 0,695 chưa chứng minh được gì.
