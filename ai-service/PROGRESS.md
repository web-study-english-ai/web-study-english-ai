# PROGRESS.md — Nhật ký mảng AI · Web Study English AI

> File sống. Claude đọc ở đầu phiên và cập nhật ở cuối phiên.
> Đi kèm: `CLAUDE.md` (luật chơi), `TASKS.md` (33 công việc AI theo 12 đợt), `docs/API_CONTRACT.md`, `docs/DECISIONS.md`.
> Nguyên tắc: ghi **ngắn, cụ thể, có mã task**. Ghi cả việc thất bại — đó là tư liệu cho báo cáo.
> Mục mới thêm lên **đầu** mỗi bảng/danh sách.

---

## 1. Trạng thái hiện tại

- **Đợt hiện tại:** Đợt 7 theo lịch; phần AI của v1.0 trễ từ đợt 6
- **Task vừa xong:** Jira **WSEA-97** — Tối ưu hiệu năng dịch vụ AI (file `TASKS.md` cũ ghi WSEA-80). Phần AI xong: đo từng bước + header `Server-Timing` (`dbb3fcd`), `scripts/bench_latency.py` (`88efbdb`), bản mới đã lên Space 22/10, số liệu mục 6.1.3, quyết định ở `docs/DECISIONS.md` mục 2026-10-22. **Chờ PR merge vào `develop`**
- **Task kế tiếp:** Jira **WSEA-83** — Phối hợp kiểm thử tích hợp dịch vụ AI với backend; trong đó đo độ trễ từ backend trên Render (có và không keep-alive) và thời gian proxy HF giữ kết nối rảnh
- **Nhánh:** `ai/WSEA-97-toi-uu-hieu-nang` (từ `develop` sau PR #75)
- **Việc dở dang cần làm tiếp:**
  - Mở PR WSEA-97 vào `develop`, dán minh chứng Jira WSEA-97
  - Báo Thạc Duy Anh: header `Server-Timing` mới (mục 8), khuyến nghị keep-alive (`keepAliveTimeout` > 15 s) và lô replay tối đa ~100 thẻ
  - Jira WSEA-82 bước 7: backend staging gọi được AI (vấn đề #15), báo Bình đổi job ping sang `/health` của Space
  - Sau WSEA-83: MK-3 → hợp đồng API v0.3 với Duy Anh (replay, cột `scheduler`, `elapsed_days`)
- **Đang bị chặn bởi:** backend staging chưa gọi AI (vấn đề #15) — chờ Bình
- **Cập nhật lần cuối:** 2026-10-23

## 2. Tiến độ theo mốc

| Mốc | Đợt | Điều kiện AI | Trạng thái | Ghi chú |
|---|---|---|---|---|
| — | 1 | Dataset đã tải, kiến trúc AI Service đã chốt | ⬜ | |
| — | 2 | EDA xong, chia tập theo user có assert, khung FastAPI chạy | ⬜ | |
| — | 3 | Cài đặt DSR 17 tham số + unit test pass | ✅ | `app/models/fsrs.py`, test toán học pass |
| MK-2 | 4 | Bảng `reviews` ghi đủ 16 trường mô hình cần | ⬜ | Phối hợp Phúc, Bình |
| v0.1 | 4 | Mô hình DSR đã huấn luyện, có số liệu so với SM-2 | ✅ | Trễ hạn, xong 2026-10-11 (WSEA-67). Tập test: DSR 0,3506 log-loss · SM-2 0,4015 · hằng số 0,3792 |
| — | 5→7 | AI Service trên **HF Spaces**, `/predict-retention` gọi được từ backend | ⚠️ | Endpoint xong (WSEA-81). 15/10 chuyển sang Render, 19/10 quay lại HF Spaces gói PRO (16 GB đủ cho cả CLIP + e5). **20/10: Space đã chạy, smoke test 7/7; CHƯA tích hợp backend** (vấn đề #15) |
| MK-3 / v1.0 | 6→7 | **Dự báo quên đúng trên production — SỐNG CÒN** | ⚠️ | Trễ theo WSEA-82. Trong lúc chờ, luồng ôn tập chạy bằng fallback `simple-scheduler.ts` |
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
| 15 | **Backend staging chưa gọi dịch vụ AI.** 20/10 20:32 ôn thử trên staging: `review.scheduler = FALLBACK_TS`, Space không nhận request nào → backend staging chưa gọi AI (nghi thiếu `AI_SERVICE_URL`). Ghi nhận: fallback NF-12 hoạt động đúng. Kiểm thêm: Secret `INTERNAL_API_KEY` trên Space thay ngày 20/10 → Bình phải đặt `AI_SERVICE_KEY` = đúng giá trị `INTERNAL_API_KEY` trong `.env` (đã gửi Bình 20/10), nếu không sẽ 401 rồi vẫn fallback. | Cao | Bình, Hiếu | Đợt 7 | Mở — chờ Bình |
| 14 | **`.venv` Python 3.13 khác image Python 3.11** — test chạy trên 3.13. Lộ ra 19/10 khi ghim `numpy==2.5.3` làm Docker build lỗi (2.5.x cần Python >= 3.12); đã lùi về 2.4.6 ở cả hai bên. | Thấp | Hiếu | Sau bảo vệ | Mở — chưa sửa, xem lại sau bảo vệ |
| 13 | **Space HF ngủ sau 48 giờ và khởi động lại** khi đẩy bản mới, sửa Settings hoặc HF bảo trì. Dự báo quên có fallback; nhận diện ảnh và trợ lý thì không. | TB | Hiếu, Bình | Đợt 7 | Mở — ping `/health` 1 lần/ngày (job của Bình); đánh thức ≥ 30 phút trước demo; không đẩy lên Space trong ngày bảo vệ |
| 12 | **Phần AI của v1.0 trễ sang đợt 7.** Jira WSEA-82 dời sang đợt 7 → WSEA-83 (kiểm thử tích hợp) và MK-3 cũng trễ. Đợt 7 vốn đã kín việc RAG. | Rất cao | Hiếu | Đợt 7 | Mở — làm WSEA-82 → WSEA-83 → MK-3 trước mọi việc RAG |
| 11 | **Hợp đồng API đổi lên 0.2, backend chưa được báo.** Đổi: path `/predict/forgetting` → `/predict-retention`; header `X-Internal-Api-Key` → `x-api-key`; khoá sai 403 → 401; bỏ `due_date`; `stability`/`difficulty` nhận `null`; thêm `extra="forbid"` (trường lạ hoặc camelCase → 422); thêm mã 500. Backend gọi theo bản cũ sẽ hỏng ngay. | Rất cao | Hiếu → Duy Anh | Trước WSEA-65 | ✅ Đóng 2026-10-09 — đã báo và thống nhất với Duy Anh |
| 10 | **Đánh số WSEA trong `TASKS.md` lệch với Jira thật.** Task "Xây dựng endpoint" ghi WSEA-64 nhưng Jira là WSEA-81; commit trước đó dùng WSEA-66 cho "huấn luyện mô hình" trong khi `TASKS.md` ghi WSEA-66 = "kiểm thử tích hợp". Cần rà toàn bộ file, nếu không minh chứng Jira sẽ gắn nhầm task. | Cao | Hiếu | Đợt 5 | Mở |
| 1 | **Thứ tự cắt giảm không thống nhất giữa các tài liệu.** Bối cảnh dự án ghi: Could have → đọc hiểu → bỏ rerank → bỏ phân loại ý định → giảm nhãn ảnh 2000→500. File 11 (sheet Mốc và bàn giao) ghi: cắt **toàn bộ** nhận diện ảnh trước tiên, rồi phân loại ý định + rerank. MK-3 cũng ghi "huỷ nhận diện ảnh nếu mô hình dự báo lỗi". Cần chốt một bản và sửa tài liệu còn lại. | Cao | Hiếu | Đợt __ | Mở |
| 2 | **SM-2 không tự sinh xác suất nhớ.** Muốn so log-loss/AUC với DSR phải định nghĩa cách quy đổi (vd dùng khoảng ôn SM-2 làm S rồi áp cùng công thức R(t,S), hoặc hàm mũ `0.9^(t/I)`). Chọn một cách, ghi rõ trong báo cáo. | Cao | Hiếu | Trước khi đánh giá | ✅ Đóng 2026-10-11 — chọn cách 1: khoảng SM-2 làm S rồi áp cùng R(t,S) (WSEA-67, `docs/DECISIONS.md`) |
| 3 | Chưa chốt mô hình **rerank** và **phân loại ý định** (vd cross-encoder nhỏ; e5 embedding + LogisticRegression). Cần đo RAM và thời gian khởi động (HF CPU basic 16 GB). | TB | Hiếu | Đợt 7 | Mở |
| 4 | Tổng RAM và thời gian khởi động khi nạp cùng lúc DSR + CLIP + e5 (+ reranker) — chưa đo. 19/10 quay lại HF 16 GB nên RAM không còn là rào cản; còn lo thời gian nạp lại sau mỗi lần Space khởi động lại. | TB | Hiếu | Đợt 7 (task "Chốt nơi đặt mô hình nặng") | Mở |
| 5 | Cold start làm request đầu chậm/timeout → backend cần timeout + fallback. | TB | Hiếu, Duy Anh | Đợt 5 | ✅ Đóng 2026-10-09 — timeout 3 s, 503 thử lại 1 lần sau 2 s rồi fallback. Sau khi quay lại HF: Space ngủ/khởi động lại → xem vấn đề #13 |
| 6 | 40.007 file CSV — huấn luyện toàn bộ có thể quá nặng. Có thể lấy mẫu một tập user; phải ghi rõ số user từng tập. | TB | Hiếu | Đợt 2 | Mở |
| 7 | Khoá nội bộ dùng header `x-api-key` (theo CLAUDE.md). Xác nhận đúng tên header và tên biến môi trường với Duy Anh, ghi vào `docs/API_CONTRACT.md`. | Thấp | Hiếu, Duy Anh | Đợt 5 | ✅ Đóng 2026-10-09 — header `x-api-key`; biến ai-service `INTERNAL_API_KEY`, biến backend `AI_SERVICE_KEY`, cùng giá trị |
| 8 | Kế hoạch AI (đợt 7) ghi "so sánh vài mô hình sinh vector" nhưng bối cảnh đã chốt e5-small. Nếu vẫn so sánh thì chỉ so 2 mô hình, hộp thời gian 2h, rồi chốt. | Thấp | Hiếu | Đợt 7 | Mở |
| 9 | Số câu đánh giá RAG không khớp: SRS NF-15 ghi 30 câu chấm tay, kế hoạch AI đợt 9 ghi 60 câu. Chốt một con số (đề xuất: 30 câu chấm độ trung thực + 60 câu đo Recall@k/MRR). | Thấp | Hiếu | Đợt 9 | Mở |

## 5. Ghi chú dữ liệu

> Mọi phát hiện khi EDA và cách xử lý. Đây là nguồn viết chương "Dữ liệu" của báo cáo.

- **Nguồn:** `open-spaced-repetition/FSRS-Anki-20k` — gated, cần HF token; giấy phép: ______
- **Số file:** repo có 40.007 file, trong đó **19.998 file CSV** (không phải 40.007 CSV). Lấy mẫu ngẫu nhiên **300 người dùng** (`random.seed(42)`, notebook Kaggle `fsrs-study-english` ô 4)
- **Số user dùng:** train **204** / val **36** / test **60** · seed = **42**. Test tách ở Kaggle (ô 9); val tách trong `run_train.py` (15% user của train)
- **File danh sách user từng tập:** `training/splits/{train,val,test}_users.txt` — tạo và kiểm chứng bằng `python -m evaluation.check_split` (tập val dựng lại khớp `report.json`: 735.540 mẫu, tỷ lệ nhớ 0,825417)
- Lần ôn đầu có `elapsed_days` = **−1** → xử lý: đặt **0**, chỉ dùng để khởi tạo trạng thái, không phải mẫu dự đoán
- Ôn cùng ngày (`elapsed_days = 0`): ______ bản ghi → xử lý: **loại bỏ toàn bộ** (Kaggle ô 7: lượt không phải lượt đầu chỉ giữ khi cách 1–3650 ngày)
- `rating` ngoài 1–4: ______ → xử lý: loại bỏ. Thẻ chỉ có 1 lượt ôn: loại bỏ
- Tỷ lệ nhãn quên (`rating == 1`, tính từ lượt thứ 2): train **12,9%** / val **17,5%** / test **12,6%**. Val lệch hẳn vì chỉ có 36 người — số liệu val dao động mạnh theo người dùng
- Biểu đồ EDA lưu tại: `outputs/eda/`

## 6. Nhật ký thí nghiệm

> Mỗi lần chạy có số liệu đáng ghi. Chỉ điền cột Test khi đánh giá cuối cùng.

### 6.1. Dự báo quên

Tất cả chạy trên cùng tập kiểm định: **n = 735.540** lượt ôn, tỷ lệ nhớ nền 0,8254, seed = 42,
50 epoch, dừng sớm patience = 5. Chia tập **theo `user_id`** (quy tắc 1).
Cột Test vẫn trống — **tập test chưa được mở**, đúng quy tắc 2.

| Ngày | Run | Mô hình | Cấu hình chính | Log-loss (val) | RMSE-bins (val) | AUC (val) | Test | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| 2026-10-11 | `evaluation/run_eval.py` | **SM-2 (baseline)** | đặc tả gốc · Khó→3 · khoảng SM-2 làm S | — | — | — | 0,4015 / 0,0959 / 0,6526 | Thua cả hằng số về log-loss: phân biệt được (AUC 0,65) nhưng sai mức xác suất (WSEA-67) |
| 2026-10-11 | `evaluation/run_eval.py` | Dự đoán hằng số | p0 = 0,8711 (tỷ lệ nhớ tập train) | 0,4716 | 0,0457 | 0,5 | 0,3792 / 0,0026 / 0,5000 | Mức sàn. Lấy p = 0,8254 (tỷ lệ của chính val) là nhìn trộm đáp án |
| 2026-09-27 | `final_lr004` | **DSR đã train** | lr=0,04 · bs=512 | **0,4510** | **0,0751** | **0,6954** | **0,3506 / 0,0450 / 0,7127** | ✅ **Tốt nhất — đã đẩy lên Hub tag `v1`, đang chạy trên endpoint** |
| 2026-09-27 | `exp03_lr001` / `final_lr001` | DSR đã train | lr=0,01 · bs=512 | 0,4519 | 0,0769 | 0,6960 | — | AUC nhỉnh hơn chút nhưng log-loss và hiệu chỉnh kém hơn |
| 2026-09-27 | `final_lr01` | DSR đã train | lr=0,1 · bs=512 | 0,4558 | 0,0762 | 0,6844 | — | lr quá lớn, hội tụ kém |
| 2026-09-27 | `final_lr0002_b2048` | DSR đã train | lr=0,002 · bs=2048 | 0,4558 | 0,0795 | 0,6937 | — | lr nhỏ + batch to: hiệu chỉnh tệ nhất nhóm |
| 2026-09-27 | `exp02_lr02` | DSR đã train | lr=0,2 · bs=512 | 0,4578 | 0,0762 | 0,6825 | — | Kém nhất |
| 2026-09-26 | `smoke` | DSR (chạy thử) | dữ liệu giả, n=1.036 | 0,7707 | 0,1861 | 0,5065 | — | Chỉ để kiểm tra vòng huấn luyện chạy được |

**Đọc bảng này thế nào:** khoảng cách giữa run tốt nhất và kém nhất chỉ 0,0068 log-loss —
tức chỉnh learning rate gần như không đổi được kết quả. Điều đó gợi ý giới hạn nằm ở
**dạng mô hình hoặc đặc trưng**, không ở tối ưu hoá. AUC ~0,695 nghĩa là mô hình phân biệt
nhớ/quên tốt hơn ngẫu nhiên nhưng còn xa mức chắc chắn.
Cập nhật 2026-10-11: đã có SM-2 và kết quả trên tập test, xem mục 6.1.1. Cột Test ghi dạng log-loss / RMSE nhóm / AUC.

#### 6.1.1. Kết quả trên tập test (WSEA-67, 2026-10-11)

Tập test chỉ mở **một lần**: 60 người, 2.130.010 lượt ôn, tỷ lệ nhớ 0,8738. DSR dùng đúng `runs/final_lr004/params.json` (v1, đang chạy trên endpoint). Chạy lại: `python -m evaluation.run_eval` → `outputs/eval/`.

| Mô hình | Log-loss | RMSE nhóm | AUC |
|---|---|---|---|
| Dự đoán hằng số (p0 = 0,8711 từ train) | 0,3792 | 0,0026 | 0,5000 |
| SM-2 quy đổi xác suất | 0,4015 | 0,0959 | 0,6526 |
| **DSR v1** | **0,3506** | 0,0450 | **0,7127** |

Chênh log-loss, khoảng tin cậy 95% bootstrap **theo người dùng** (1.000 lần):
- DSR − SM-2: **−0,0509** [−0,0613; −0,0379] → DSR tốt hơn chắc chắn
- DSR − hằng số: **−0,0286** [−0,0646; −0,0090] → tốt hơn chắc chắn, nhưng mức cải thiện khác nhiều giữa các người dùng

AUC không phụ thuộc cách quy đổi SM-2 (mọi cách quy đổi hợp lý đều là hàm đơn điệu của t/I nên giữ nguyên thứ hạng), nên lợi thế AUC 0,7127 so với 0,6526 không do cách quy đổi tạo ra.

**Phân tích lỗi** (`outputs/eval/retention_report.md`, `outputs/eval/calibration.png`):

1. **Lượt ôn đầu tiên sau khi học (pos = 1, 16% số mẫu): DSR gần như không giúp gì.** Chỉ hơn hằng số 0,004 log-loss (0,4701 so với 0,4745), trong khi ở pos 2–10 hơn khoảng 0,04. Còn đoán lạc quan: 85,4% so với thực tế 82,4%. Lý do: lúc này mô hình chỉ biết một lần đánh giá, S₀ = w[rating−1] chỉ có 4 giá trị, và các bước học trong ngày đầu đã bị loại khi tiền xử lý.
2. **Lệch theo khoảng cách ôn, về hai phía ngược nhau.** Cách 1 ngày: DSR đoán 90,1%, thực tế 85,0% → lạc quan 5 điểm, phía nguy hiểm (lịch ôn bị lùi xa, người học quên trước khi ôn). Cách hơn 91 ngày: đoán 81,6%, thực tế 87,4% → bi quan 6 điểm, phía an toàn (ôn sớm hơn cần, chỉ tốn thời gian). Lượt cách 1 ngày chủ yếu là thẻ mới hoặc vừa quên, trùng với nhận xét 1: lỗi đáng lo tập trung ở thẻ mới.
3. **SM-2 thua hằng số vì sai mức xác suất, không phải vì không phân biệt được.** Khi SM-2 đoán khoảng 8% nhớ (2.130 lượt), thực tế 75,5% vẫn nhớ; nhóm đoán 15% thì thực tế 58%. SM-2 cho xác suất rất thấp mỗi khi người học ôn trễ so với khoảng nó đặt, mà người học thật vẫn nhớ phần lớn. Mỗi lượt như vậy bị phạt −ln(0,08) ≈ 2,5, kéo log-loss lên 0,4015 dù AUC vẫn 0,65.

**Hạn chế phải ghi trong báo cáo:**
- Vùng xác suất thấp rất thưa (các nhóm dự đoán dưới 0,5 chỉ khoảng 4% số lượt). Ở đó DSR bi quan: đoán 25% thì thực tế khoảng 46%. Không cắt khỏi biểu đồ.
- Chỉ 60 người dùng test, lấy mẫu từ 300 người → khoảng tin cậy rộng; người dùng thật của sản phẩm có thể khác phân bố Anki.
- Cách quy đổi SM-2 là lựa chọn của nhóm; log-loss và RMSE của SM-2 phụ thuộc lựa chọn này, AUC thì không.

**Hướng phát triển:** dùng lượt ôn trong ngày (FSRS-5 có tham số riêng) để giảm lỗi ở thẻ mới. **Không** chỉnh mô hình theo kết quả test này (quy tắc 2).

#### 6.1.2. Số đo triển khai `/predict-retention` (Jira WSEA-82)

Chạy lại: `python scripts/smoke_test.py --url <URL> --wait --key-env AI_KEY` (20 lần mỗi cỡ lô, đo phía client, mỗi request mở kết nối HTTPS mới).

| Hạng mục | Docker 17/10 (`--memory=512m --cpus=0.5`) | Docker 19/10 (`--cpus=2`) | HF Space 20/10 (CPU basic, đo từ máy ở Việt Nam) |
|---|---|---|---|
| Image | 1,54 GB | 1,54 GB | cùng `Dockerfile` |
| Khởi động → `/health` 200 | 5,1 s | 3,1 s | Space đã chạy sẵn (chờ 0,8 s) |
| RAM nghỉ / đỉnh | 182,6 / 198,1 MiB | 183 / 187,5 MiB | — (không đo được từ ngoài) |
| Lô 1 thẻ p50 / p95 | 14,6 / 25,4 ms | 15,2 / 25,8 ms | 739,8 / 761,0 ms |
| Lô 500 thẻ p50 / p95 | 15,6 / 36,6 ms | 28,1 / 30,8 ms | 1.712,6 / 1.825,7 ms |
| Smoke test | 6/6 | 6/6 | 7/7 (R = 0,97299, S' = 25,72) |

**Vì sao production chậm hơn ~50 lần:** gần như toàn bộ là mạng. Một vòng đi về Việt Nam → máy chủ HF ≈ 245 ms (`/health` giữ kết nối); mở kết nối HTTPS mới (TCP + TLS) tốn thêm ≈ 500 ms → `/health` không giữ kết nối ≈ 744 ms, bằng lô 1 thẻ. Lô 500 thêm ≈ 1 s do gửi/nhận vài chục KB JSON qua đường RTT cao (TCP tăng tốc dần qua nhiều vòng) và phân tích JSON trên CPU basic. Phần tính toán của mô hình chỉ ≈ 1,5 ms/500 thẻ (log 17/10).

**Hệ quả:** backend gửi 1 thẻ mỗi lượt ôn → ≈ 0,75 s từ Việt Nam, trong hạn timeout 3 s. Backend đặt ở Singapore sẽ có RTT khác, phải đo lại ở WSEA-83. Lô 500 thẻ p95 1,83 s còn ít dư so với 3 s nếu sau này gửi lô lớn (vd replay).

#### 6.1.3. Đo hiệu năng theo từng bước (Jira WSEA-97)

Chạy lại (cần dịch vụ có header `Server-Timing`, từ commit `dbb3fcd`):

```powershell
$env:AI_KEY = "<khoa>"   # khong in, khong ghi vao JSON
python scripts/bench_latency.py --key-env AI_KEY --out docs/perf/<ngay>-local.json
python scripts/bench_latency.py --url https://hieusss-wsea-ai-service.hf.space --key-env AI_KEY --out docs/perf/<ngay>-space.json
```

Mặc định 3 warmup + 30 lần mỗi ô, cỡ lô 1 và 500, seed 42; thẻ thử sinh ngẫu nhiên (~20% thẻ mới). `new` = mỗi request mở kết nối mới (gồm TCP + TLS), `keepalive` = một kết nối cho cả chuỗi. **Đo cục bộ trên Windows phải dùng `127.0.0.1`**, không dùng `localhost` (mục 7). Số liệu thô: `docs/perf/2026-10-21-local.json`, `docs/perf/2026-10-22-space.json`.

Đơn vị ms. Ngoài app = client − app (từng request, rồi lấy p50).

| Môi trường | Chế độ | Cỡ lô | Client p50 / p95 | App p50 | Model p50 | Ngoài app p50 |
|---|---|---|---|---|---|---|
| Laptop, uvicorn 127.0.0.1 (21/10) | new | 1 | 1,32 / 2,74 | 0,67 | 0,282 | 0,65 |
| | new | 500 | 7,39 / 29,69 | 4,44 | 0,394 | 1,40 |
| | keepalive | 1 | 1,03 / 1,44 | 0,64 | 0,270 | 0,40 |
| | keepalive | 500 | 4,84 / 5,21 | 4,33 | 0,351 | 0,55 |
| Space, đo từ Việt Nam (22/10) | new | 1 | 1.153,0 / 2.621,9 | 1,54 | 0,659 | 1.151,3 |
| | new | 500 | 2.120,8 / 2.688,5 | 268,1 | 0,719 | 1.832,1 |
| | keepalive | 1 | 296,7 / 423,9 | 1,55 | 0,630 | 292,5 |
| | keepalive | 500 | 1.113,4 / 2.166,8 | 46,0 | 0,658 | 1.048,7 |

**Lưu ý khi đọc cột "app":** app tính từ lúc uvicorn chuyển request vào ứng dụng, **GỒM thời gian nhận body qua mạng** (ứng dụng phải đọc hết body mới parse được). Vì vậy lô 500 trên kết nối mới ra app 268 ms, trong khi phần tính trong handler (tổng 4 khoảng tensor + model + check + build) chỉ khoảng 2,8 ms trên Space (trung vị 60 mẫu lô 500: new 2,9 ms, keepalive 2,6 ms); phần dư chủ yếu là chờ 46,5 KB body đi qua đường truyền đang tăng tốc dần (TCP slow start trên kết nối mới). Trên kết nối giữ sẵn, app 24–46 ms **vẫn gồm** một phần thời gian nhận body và kiểm tra đầu vào bằng Pydantic, không phải thời gian tính toán. Cột "model" mới là thời gian mô hình thật.

Lô vs lẻ (giữ kết nối, 50 thẻ, lặp 5 lần; trung vị [min; max]):

| Môi trường | Cách gửi | Tổng (ms) | ms/thẻ | Lẻ / lô |
|---|---|---|---|---|
| Laptop (21/10) | 1 request × 50 thẻ | 1,54 [1,42; 1,65] | 0,031 [0,028; 0,033] | ×37,2 |
| | 50 request × 1 thẻ | 57,14 [52,60; 88,35] | 1,143 [1,052; 1,767] | |
| Space từ Việt Nam (22/10) | 1 request × 50 thẻ | 585,3 [360,2; 2.777,4] | 11,71 [7,20; 55,55] | ×39,9 |
| | 50 request × 1 thẻ | 23.359,8 [19.272,5; 28.815,6] | 467,2 [385,5; 576,3] | |

**Chẩn đoán mạng 22/10** (đo tay cùng buổi, không có trong JSON):

- Smoke test Space 22/10 14:35: **6/7**, mọi ca chức năng đạt; chỉ ca độ trễ lô 500 không đạt (p50 3.348 ms, p95 7.802 ms > 3 s). Lô 1 p50 883 / p95 2.261 ms.
- TCP connect p50 318 ms (20/10 ~245 ms) → đường mạng hôm đó chậm hơn. `/health` giữ kết nối p50 345 ms, max 1.423 ms.
- Lô 500 giữ kết nối: client p50 2.705 ms, app p50 24 ms, model ~0,8 ms → **99% thời gian nằm ngoài ứng dụng**. Body gửi 46,5 KB, nhận 69,3 KB.

**Kết luận:** phần tính toán phía máy chủ chỉ chiếm khoảng 0,5–5% thời gian backend chờ (keepalive: 1,55/297 ms ở lô 1, 46/1.113 ms ở lô 500). Giữ kết nối giảm lô 1 từ p50 1.153 → 297 ms (−74%), p95 2.622 → 424 ms — đây là cải thiện lớn nhất có được, và nằm ở phía backend. Quyết định tối ưu: `docs/DECISIONS.md` mục 2026-10-22.

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
| 2026-10-21 | `bench_latency.py` chế độ `new` trên máy local mất ~2 s mỗi request | `localhost` trên Windows phân giải ra `::1` (IPv6) trước, uvicorn chỉ nghe `127.0.0.1` → mỗi kết nối mới chờ IPv6 thất bại rồi mới sang IPv4 (đo: 2.035 ms so với 0,2 ms) | Đo cục bộ dùng `127.0.0.1`. URL mặc định của `bench_latency.py` là `127.0.0.1`, script in cảnh báo khi gặp `localhost`. `smoke_test.py` vẫn mặc định `localhost` | WSEA-97 |
| 2026-09-28 | Mọi request có header khoá trả **500** thay vì 403/401 | Commit `a95872c` đổi `deps.py` sang gọi `.get_secret_value()` nhưng `config.py` vẫn khai `internal_api_key: str` → `AttributeError`. Không có test endpoint nào nên không ai phát hiện | Đổi sang `SecretStr` (`Field(min_length=32)`); thêm test ca "sai khoá → 401" để khoá lại | WSEA-81 |
| 2026-09-28 | Gửi `NaN` trong JSON trả **500** thay vì 422 | FastAPI 0.115.6 nhét giá trị người dùng vào trường `input` của body lỗi; `NaN` không serialize được nên chính body lỗi làm văng 500 | Thêm `exception_handler` cho `RequestValidationError` trong `main.py`, chỉ trả `loc`/`msg`/`type`. Kèm `allow_inf_nan=False` ở schema | WSEA-81 |
| 2026-09-28 | Gõ sai tên trường (`stabilty`) hoặc camelCase (`elapsedDays`) trả **200 với kết quả sai** | Pydantic mặc định bỏ qua trường lạ → thẻ cũ bị coi là thẻ mới, trả khoảng ôn hoàn toàn khác mà không báo gì | `extra="forbid"` cho mọi schema đầu vào; thêm test cho cả hai trường hợp | WSEA-81 |
| 2026-09-28 | Test `subprocess` kiểm tra import bị `OSError [WinError 10106]` | Truyền `env={"PATH":"", "SYSTEMROOT":""}` làm Windows không nạp được DLL mạng mà `torch` cần | Giữ nguyên `os.environ`, chỉ loại đúng biến cần thử | WSEA-81 |
| (khởi tạo) | `hf_hub_download` báo 401/403 với dataset gated dù đã login | Không nhận token ngầm trong môi trường đó | Truyền `token=tok` trực tiếp vào `hf_hub_download` | — |

## 8. Thay đổi hợp đồng API với backend

| Ngày | Endpoint | Thay đổi | Đã báo Duy Anh? | Commit |
|---|---|---|---|---|
| 2026-09-28 | `POST /predict-retention` | Đường dẫn đổi từ `/predict/forgetting` (code cũ lệch hợp đồng) | ✅ 2026-10-09 | WSEA-81 |
| 2026-09-28 | tất cả | Header đổi `X-Internal-Api-Key` → `x-api-key`; khoá sai `403` → `401` | ✅ 2026-10-09 | WSEA-81 |
| 2026-09-28 | `POST /predict-retention` | **Bỏ `due_date`** — backend tự cộng ngày theo múi giờ người học | ✅ 2026-10-09 | WSEA-81 |
| 2026-09-28 | `POST /predict-retention` | `stability`/`difficulty` nhận `null` cho thẻ mới; `retrievability` trả `null` khi đó | ✅ 2026-10-09 | WSEA-81 |
| 2026-09-28 | `POST /predict-retention` | Thêm `model_version` vào response | ✅ 2026-10-09 | WSEA-81 |
| 2026-09-28 | tất cả | `extra="forbid"`: trường lạ / camelCase → 422. `NaN`/`Infinity` → 422 | ✅ 2026-10-09 | WSEA-81 |
| 2026-09-28 | tất cả | Thêm mã **500** (mô hình trả giá trị không hữu hạn) — backend fallback với mọi 5xx | ✅ 2026-10-09 | WSEA-81 |
| 2026-09-28 | `GET /health` | Thêm `models`, `model_version`; trả **503** khi `status="degraded"` | ✅ 2026-10-09 | WSEA-81 |
| 2026-10-22 | `POST /predict-retention` | Thêm header **`Server-Timing`** ở response 200 (`tensor`, `model`, `check`, `build`, `app`, ms) — chỉ để chẩn đoán, tương thích ngược, body và mã lỗi không đổi, vẫn v0.2 | ⏳ chưa | WSEA-97 (`dbb3fcd`) |

## 9. Nhật ký phiên làm việc

> Mỗi phiên một mục, mới nhất ở trên. 3–6 dòng là đủ.

### 2026-10-22 · Đợt 7 · WSEA-97 — Đo hiệu năng dịch vụ AI và quyết định tối ưu

- **Đã làm:** đo 4 bước `tensor`/`model`/`check`/`build` trong `/predict-retention` + header `Server-Timing` qua middleware ASGI thuần (`dbb3fcd`, 125 test pass); script `scripts/bench_latency.py` đo chế độ new/keepalive và lô vs lẻ (`88efbdb`); Hiếu đẩy bản mới lên Space, đo từ Việt Nam ngày 22/10.
- **Kết quả chính:** lô 500 trên Space giữ kết nối: client p50 2.705 ms, app 24 ms, model ~0,8 ms → 99% ngoài ứng dụng. Giữ kết nối giảm lô 1 từ p50 1.153 → 297 ms (−74%). Lô vs lẻ ×37,2 (laptop) / ×39,9 (Space). Smoke test 22/10 6/7: chức năng đạt, lô 500 p95 7.802 ms > 3 s. Chi tiết mục 6.1.3.
- **Quyết định:** không làm bộ nhớ đệm, không tối ưu Pydantic; khuyến nghị backend keep-alive; lô replay tối đa ~100 thẻ (`docs/DECISIONS.md` mục 2026-10-22). Ghi header `Server-Timing` vào `docs/API_CONTRACT.md` (tương thích ngược, vẫn v0.2).
- **Lỗi gặp:** `localhost` trên Windows thử IPv6 trước → +2 s mỗi kết nối mới khi đo cục bộ (mục 7).
- **Việc tiếp theo:** báo Thạc Duy Anh khuyến nghị keep-alive (`keepAliveTimeout` > 15 s) và giới hạn lô replay; đo lại từ backend trên Render ở Jira WSEA-83; dán minh chứng Jira WSEA-97.

### 2026-10-20 · Đợt 7 · Smoke test trên Space production (Jira WSEA-82 bước 6)

- **Bối cảnh:** tối 19/10 Hiếu đã mua PRO, tạo Space `Hieusss/wsea-ai-service`, khai Secrets/Variables, đẩy code (bước 3–5); Space RUNNING, `/health` 200 (model v1).
- **Sự cố:** lần chạy đầu 4 ca có khoá đều 401 "Khoa API noi bo khong hop le" — Secret `INTERNAL_API_KEY` trên Space khác giá trị trong `.env` (khoá `.env` đã đổi sau 17/10). Hiếu thay Secret bằng giá trị `.env` và làm mới `HF_TOKEN`.
- **Kết quả:** smoke test 7/7 trên `https://hieusss-wsea-ai-service.hf.space`; lô 1 p50 740 ms, lô 500 p50 1.713 ms — chủ yếu do mạng (mục 6.1.2). URL ghi vào `docs/API_CONTRACT.md`.
- **Vấn đề mới #15:** ôn thử trên staging ra `FALLBACK_TS`, Space không nhận request → backend staging chưa gọi AI; fallback NF-12 chạy đúng.
- **Việc tiếp theo:** chờ Bình sửa staging (`AI_SERVICE_URL`, `AI_SERVICE_KEY` trùng Secret mới) rồi ôn thử lại tới khi ra `FSRS_AI`; bước 7 còn lại; WSEA-83.

### 2026-10-19 · Đợt 7 · Quay lại Hugging Face Spaces (Jira WSEA-82)

- **Bối cảnh:** nhóm chốt quay lại HF Spaces gói PRO (9 USD/tháng, 16 GB RAM) thay cho Render 512 MB — lý do ở `docs/DECISIONS.md` mục 2026-10-19.
- **Đã làm:** cập nhật `CLAUDE.md`, `.claude/settings.json` (cấm `hf upload`, `hf auth login`), `.claude/agents/ra-soat-ai.md`, `TASKS.md` (WSEA-82 7 bước mới, task mô hình nặng, task tắt dịch vụ), `PROGRESS.md`, `docs/DECISIONS.md`, `docs/API_CONTRACT.md` (chỉ phần triển khai), docstring `scripts/smoke_test.py`.
- **Không cần sửa:** Dockerfile, README (khối YAML `sdk: docker`, `app_port: 7860`), docstring trong `app/` — vốn viết cho HF.
- **WSEA-82 bước 1:** ghim `numpy==2.5.3` (theo `.venv`) làm Docker build lỗi vì 2.5.x cần Python >= 3.12 mà image dùng 3.11 → lùi về `numpy==2.4.6` ở `requirements.txt` và `.venv`; 118 test pass. Đo lại `--cpus=2`: image 1,54 GB, khởi động 3,1 s, RAM nghỉ 183 MiB, đỉnh 187,5 MiB, lô 500 p50 28,1 ms / p95 30,8 ms; smoke test 6/6. Vấn đề #14.
- **Việc tiếp theo:** Hiếu mua PRO, tạo Space, khai Secrets, đẩy code; smoke test trên URL `.hf.space`.

### 2026-10-17 · Đợt 6 · Chuyển nền tảng triển khai sang Render (chuẩn bị Jira WSEA-82)

- **Bối cảnh:** HF Spaces giờ đòi gói PRO mới tạo được Docker Space (trang tạo Space của `Hieusss` gắn nhãn "Paid"). Nhóm chốt Render `0.5c-512mb`, 7 USD/tháng (2026-10-15). Hiếu dời Jira WSEA-82 sang đợt 7 và tạo 2 task mới (chốt nơi đặt mô hình nặng; tắt dịch vụ sau bảo vệ).
- **Đã làm:** cập nhật `CLAUDE.md`, `TASKS.md` (bảng đối chiếu mã, chuyển WSEA-82 sang đợt 7, thêm 2 task mới), `PROGRESS.md`, `docs/DECISIONS.md`, `docs/API_CONTRACT.md` (chỉ phần triển khai, không đổi giao diện), `.claude/agents/ra-soat-ai.md`. Tạo nhánh `ai/WSEA-82-deploy-render`.
- **Chưa làm (thuộc WSEA-82):** `requirements.txt`, Dockerfile, README (còn khối YAML của HF), docstring trong `app/` còn nhắc HF Spaces.
- **Việc tiếp theo:** gỡ conflict PR #62; WSEA-82 bước 1–2 (đo Docker ở 512 MB).

### 2026-10-11 · Đợt 6 · WSEA-67 — Cài đặt đường cơ sở và đánh giá mô hình

- **Đã làm:** `evaluation/check_split.py` (dựng lại tập val, kiểm tra không rò rỉ, lưu `training/splits/`); `evaluation/sm2.py` theo đặc tả gốc + 6 test; `evaluation/run_eval.py` chạy hằng số, SM-2, DSR v1 trên cùng bảng mẫu, có kiểm tra "ống đo" trên val trước khi mở test.
- **Kết quả:** tập test, log-loss DSR 0,3506 · hằng số 0,3792 · SM-2 0,4015; AUC DSR 0,7127 · SM-2 0,6526. DSR − SM-2 = −0,0509 [−0,0613; −0,0379]. Chi tiết mục 6.1.1.
- **Bẫy đã tránh:** `FSRSModel.forward` trả dự đoán theo thứ tự "vị trí trước, chuỗi sau", khác bảng mẫu; ghép thẳng thì phân tích lỗi theo nhóm sai mà không báo lỗi. `dsr_predict` sắp lại bằng `torch.nonzero` và `assert` nhãn trùng từng dòng.
- **Phát hiện phương pháp:** dùng tỷ lệ nhớ của chính tập val làm mô hình hằng số (0,463) là nhìn trộm đáp án; đúng là lấy từ train (0,4716).
- **Minh chứng Jira:** commit `fe20f88`, `38d6cd0`, `a816644`, `5a0812a` trên nhánh `ai/WSEA-67-baseline-eval`; `pytest -q` 118 pass; `outputs/eval/retention_report.md`, `retention_metrics.json`, `calibration.png`.
- **Việc tiếp theo:** push + PR; WSEA-65 lên HF Spaces; hợp đồng API v0.3.

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
