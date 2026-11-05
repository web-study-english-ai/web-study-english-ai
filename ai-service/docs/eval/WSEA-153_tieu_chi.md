# WSEA-153 — Tiêu chí đánh giá nhận diện ảnh → từ vựng (chốt trước khi chạy tập test)

Chốt 2026-11-05, **trước** khi có tập test và trước khi chỉnh τ. Không sửa sau khi đã thấy kết quả tập test; nếu buộc phải sửa thì ghi ngày, lý do, commit cũ ở cuối file.

- Mô hình, tập nhãn, template giữ nguyên WSEA-152: `openai/clip-vit-base-patch32` @ `3d74acf9…`, 449 nhãn (`kb/vision_labels.csv`, `rule_version v1-2026-11-04`), 3 template. **Không đổi nhãn, template theo kết quả** của tập dev hay tập test.
- Phạm vi: endpoint `POST /recognize/image` + script chỉnh τ. Chạy local; không đẩy Space trong task này.

## 1. Dữ liệu

| tập | nguồn | dùng cho | số lần chạy |
|---|---|---|---|
| **dev** | 10 ảnh spike `data/vision_samples/` (WSEA-152) + ảnh dev mới `data/vision_dev/` | chỉnh τ, gỡ lỗi | không giới hạn |
| **test** | 50 ảnh `data/vision_test/` | số chính thức | **đúng 1 lần**, sau khi τ đã chốt và commit |

- Nhãn đúng của ảnh = phần tên file trước dấu `_` đầu tiên (`cup_09.jpg` → `cup`), chữ thường.
- Ảnh có nhãn đúng **không thuộc** 449 nhãn: báo riêng, **không** tính vào top-k, coverage, accuracy.
- Tập test do người chụp, **không trùng** ảnh dev (kiểm sha256 trước khi chạy). Ảnh test không được xem kết quả mô hình trước lượt chạy chính thức.
- Ảnh > 2 MB/ảnh không commit (`data/` đã nằm trong `.gitignore`).
- **Trạng thái 2026-11-05**: dev chỉ có 10 ảnh spike (1 ảnh `fan` ngoài tập nhãn → 9 ảnh tính được); `data/vision_dev/` và `data/vision_test/` chưa có ảnh.

## 2. Hai cách chấm

- **Chặt**: từ dự đoán == nhãn đúng.
- **Nới theo nhóm đồng nghĩa**: từ dự đoán cùng nhóm với nhãn đúng trong `kb/vision_synonyms.csv`, hoặc bằng nhãn đúng.
  - 27 nhóm, 65 từ, chốt cùng ngày, trước tập test. Mỗi từ thuộc tối đa 1 nhóm; mọi từ thuộc 449 nhãn và khớp đúng 1 từ trong `backend/prisma/data/vocab_7000.csv` (`tests/test_vision_synonyms.py`).
  - Nguyên tắc: chỉ gộp từ **cùng chỉ một vật trong ảnh** mà người học chấp nhận được (cup~mug, book~textbook~novel~dictionary~encyclopedia~guidebook, computer~pc~screen, phone~telephone, fridge~refrigerator…). **Không** gộp quan hệ cha–con kiểu flower~rose, không gộp bộ phận cơ thể gần nhau (cheek/chin).
  - Ghi nhận trung thực: ba cặp cup~mug, book~textbook, computer~screen được gợi ý từ lỗi đã thấy ở spike WSEA-152 (tập dev). Vì vậy số "nới" trên tập dev bị lạc quan; số "nới" chính thức chỉ lấy từ tập test.
  - `laptop` không có trong 449 nhãn nên không có trong nhóm `computer`.

## 3. Chỉ số

Báo cả **chặt** và **nới** cho mỗi chỉ số; tổng và kèm danh sách ảnh sai.

| chỉ số | định nghĩa |
|---|---|
| top-1 | tỉ lệ ảnh có nhãn đúng ở hạng 1 |
| top-5 | tỉ lệ ảnh có nhãn đúng trong 5 hạng đầu |
| coverage | tỉ lệ ảnh **được trả lời**: top-1 score ≥ τ (`low_confidence = false`) |
| accuracy khi trả lời | top-1 đúng / số ảnh được trả lời |
| độ trễ | ms/ảnh từ lúc nhận bytes tới top-10, bỏ lần đầu (làm nóng), 2 luồng torch; báo **p50, p95** |

- score = xác suất softmax × `logit_scale` trên 449 nhãn (WSEA-152).
- Không đặt ngưỡng đạt/trượt cho tập test; quyết định dùng thật do Hiếu dựa trên số.

## 4. Chỉnh τ (chỉ trên dev)

- Lưới τ ∈ {0,05; 0,10; …; 0,60}. Script in bảng τ ↔ coverage, accuracy khi trả lời (chặt và nới) trên dev.
- **Luật chọn (chốt trước khi chạy)**: τ = giá trị **lớn nhất** trong lưới có coverage dev ≥ 0,70. Không có giá trị nào đạt → τ = 0,05.
- τ chọn xong ghi vào `VISION_TAU` (mặc định trong `app/config.py`) và commit **trước** khi chạy tập test. Tập test chạy với τ đó, không chỉnh lại.
- Hạn chế: dev hiện chỉ 9 ảnh tính được — một ảnh = 11 điểm %; τ chọn từ 9 ảnh rất thô. Thêm ảnh dev mới trước khi chốt τ sẽ tốt hơn.

## 5. Hạn chế đã biết

- Tập test 50 ảnh, 1 người chụp, 1 lần chạy.
- Đo trên laptop; độ trễ không đại diện cho Space CPU basic.
- Nhóm đồng nghĩa là phán đoán tay của nhóm AI.
