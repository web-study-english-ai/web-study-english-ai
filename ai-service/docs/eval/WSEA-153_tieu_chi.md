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
- **50 vật của tập test** (chốt 2026-11-05, TRƯỚC khi chụp): `kb/vision_test_objects.csv`, sinh bởi `scripts/pick_vision_test_objects.py` — 1 ảnh/vật, tên file `<word>_<số>.jpg`.
  - Số vật mỗi bậc theo tỉ lệ 449 nhãn (A1 80 · A2 160 · B1 209 → **A1 9 · A2 18 · B1 23**, phần dư lớn nhất); `random.Random(153)`; trong mỗi bậc sắp theo `word` rồi `rng.sample`.
  - Loại trước khi bốc **134 nhãn không chụp được ở nhà** (`NOT_AT_HOME`, nguyên văn): `champagne`, `wine`, `gun`, `sword`, `cigarette`, `tobacco`, `ambulance`, `wheelchair`, `coffin`, `boat`, `brake`, `bus`, `car`, `carriage`, `chariot`, `ferry`, `lorry`, `metro`, `motorcycle`, `parachute`, `petrol`, `plane`, `ship`, `signpost`, `submarine`, `subway`, `taxi`, `tent`, `tire`, `train`, `tram`, `van`, `wagon`, `windscreen`, `mailbox`, `fountain`, `arrow`, `fence`, `pole`, `brick`, `drum`, `flute`, `guitar`, `piano`, `trumpet`, `violin`, `racket`, `paddle`, `ski`, `skate`, `snowboard`, `medal`, `sculpture`, `statue`, `firework`, `blackboard`, `encyclopedia`, `cassette`, `comet`, `satellite`, `spaceship`, `robot`, `engine`, `motor`, `antique`, `barrel`, `cage`, `cart`, `elevator`, `escalator`, `harness`, `diamond`, `jewel`, `crown`, `locker`, `noticeboard`, `dishwasher`, `diaper`, `gown`, `bra`, `underpants`, `ape`, `beast`, `beaver`, `bee`, `bird`, `bull`, `camel`, `cattle`, `chimpanzee`, `cow`, `dinosaur`, `dolphin`, `duck`, `elephant`, `flea`, `giraffe`, `gorilla`, `horse`, `insect`, `kitten`, `lamb`, `lion`, `monkey`, `mosquito`, `mule`, `parrot`, `pig`, `puppy`, `rabbit`, `rat`, `shark`, `sheep`, `snake`, `tiger`, `turtle`, `whale`, `daisy`, `fire`, `fog`, `frost`, `fur`, `maple`, `moon`, `moss`, `mud`, `nest`, `oak`, `planet`, `root`, `sand`, `seaweed`, `sun`, `sunflower`.
  - Không bốc lại để đổi vật; vật khó tìm vẫn giữ (vd `beard`, `cod`) — không chụp được thì ghi thiếu, không thay.
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

## 4b. Điều chỉnh trước khi chạy test (2026-11-06, TRƯỚC lượt chạy duy nhất)

- **Tập test là 48 ảnh thu thập từ web**, không phải ảnh tự chụp như mục 1 dự kiến — không đủ thời gian chụp. Mỗi vật 1 ảnh, tên `<word>_01.*` trong `data/vision_test/`.
- **Thiếu 2 vật**: `beef`, `chicken` (không có ảnh) → ghi thiếu, **không thay vật khác** (đúng mục 1). Mẫu số top-k = 48.
- **Hệ quả**: ảnh web có thể đã nằm trong dữ liệu huấn luyện CLIP (ảnh + chú thích lấy từ internet) → kết quả **lạc quan** so với ảnh người học tự chụp. Ảnh web còn thường rõ nét, chính diện, nền sạch, đôi khi có chữ. Số của tập này không đại diện cho ảnh thật của người dùng.
- Không đổi gì khác: τ = 0,40 (đã khoá ở `a7d6a7c`), nhãn, template, nhóm đồng nghĩa, chỉ số giữ nguyên. Ảnh thu nhỏ về cạnh dài 1024 px như tập dev; sha256 từng ảnh ghi vào `reports/153_test_manifest.json` trước khi chạy.

## 5. Hạn chế đã biết

- Tập test 50 ảnh, 1 người chụp, 1 lần chạy.
- Đo trên laptop; độ trễ không đại diện cho Space CPU basic.
- Nhóm đồng nghĩa là phán đoán tay của nhóm AI.
