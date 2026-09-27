# PROGRESS.md — Nhật ký mảng AI · Web Study English AI

> File sống. Claude đọc ở đầu phiên và cập nhật ở cuối phiên.
> Đi kèm: `CLAUDE.md` (luật chơi), `TASKS.md` (33 công việc AI theo 12 đợt), `docs/API_CONTRACT.md`, `docs/DECISIONS.md`.
> Nguyên tắc: ghi **ngắn, cụ thể, có mã task**. Ghi cả việc thất bại — đó là tư liệu cho báo cáo.
> Mục mới thêm lên **đầu** mỗi bảng/danh sách.

---

## 1. Trạng thái hiện tại

- **Đợt hiện tại:** Đợt __ (D__–D__)
- **Task đang làm:** WSEA-__ — ...
- **Nhánh:** `ai/WSEA-__-...`
- **Việc dở dang cần làm tiếp:** ...
- **Đang bị chặn bởi:** ... (người/việc nào, từ khi nào)
- **Cập nhật lần cuối:** YYYY-MM-DD

## 2. Tiến độ theo mốc

| Mốc | Đợt | Điều kiện AI | Trạng thái | Ghi chú |
|---|---|---|---|---|
| — | 1 | Dataset đã tải, kiến trúc AI Service đã chốt | ⬜ | |
| — | 2 | EDA xong, chia tập theo user có assert, khung FastAPI chạy | ⬜ | |
| — | 3 | Cài đặt DSR 17 tham số + unit test pass | ⬜ | |
| MK-2 | 4 | Bảng `reviews` ghi đủ 16 trường mô hình cần | ⬜ | Phối hợp Phúc, Bình |
| v0.1 | 4 | Mô hình DSR đã huấn luyện, có số liệu so với SM-2 | ⬜ | |
| — | 5 | AI Service trên HF Spaces, `/predict-retention` gọi được từ backend | ⬜ | |
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

| Ngày | Run | Mô hình | Cấu hình chính | Log-loss (val) | RMSE-bins (val) | AUC (val) | Test | Commit | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|
| | | SM-2 (baseline) | | | | | | | |
| | | DSR mặc định (chưa train) | w mặc định | | | | | | |
| | | DSR đã train | lr=, epochs=, batch= | | | | | | |

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
| (khởi tạo) | `hf_hub_download` báo 401/403 với dataset gated dù đã login | Không nhận token ngầm trong môi trường đó | Truyền `token=tok` trực tiếp vào `hf_hub_download` | — |

## 8. Thay đổi hợp đồng API với backend

| Ngày | Endpoint | Thay đổi | Đã báo Duy Anh? | Commit |
|---|---|---|---|---|

## 9. Nhật ký phiên làm việc

> Mỗi phiên một mục, mới nhất ở trên. 3–6 dòng là đủ.

### YYYY-MM-DD · Đợt __ · WSEA-__
- **Đã làm:** ...
- **Kết quả / số liệu:** ...
- **Vấn đề mới:** ... (đã thêm vào mục 4 chưa?)
- **Minh chứng Jira:** commit ..., ảnh ..., file `outputs/...`
- **Việc tiếp theo:** ...
