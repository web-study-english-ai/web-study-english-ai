# WSEA-152 — Tập nhãn CLIP zero-shot và tiêu chí spike

**Chốt ngày 2026-11-04, TRƯỚC khi chạy mô hình.** Không sửa luật, danh sách hay tiêu chí sau khi đã thấy kết quả spike; nếu buộc phải sửa thì ghi ngày, lý do, commit cũ ở cuối file và sinh lại tập nhãn.

- Phạm vi: spike + module chạy **local**. Không thêm endpoint, không đổi `docs/API_CONTRACT.md`, không đụng Space.
- Nhận diện ảnh = nhận diện **vật thể** rồi tra bảng từ vựng, không phải OCR (CLAUDE.md).

## 1. Tập nhãn

- **Nguồn**: `backend/prisma/data/vocab_7000.csv` (backend sở hữu; ai-service **chỉ đọc**, không sửa). Lúc chốt: commit sửa gần nhất `8c95c1a3df3c1177c735a24bcf0026298e1270aa`, blob `d3f3b51f72c1a5a41217a5c70f08e37742c05662`, sha256 `546776fd…793d7` (đủ trong `kb/vision_labels_manifest.json`).
- **Sinh lại**: `scripts/build_vision_labels.py` → `kb/vision_labels.csv` (cột `word, cefr, pos, meaning_vi, topic_code, rank`, sắp theo `rank`) + `kb/vision_labels_manifest.json` (đường dẫn nguồn, commit + blob + sha256 của file nguồn, sha256 đầu ra, số nhãn, thống kê từng bước). **Duy Anh sửa file nguồn → phải chạy lại script, rồi tính lại vector nhãn** (manifest vector ghi sha256 tập nhãn nên lệch sẽ bị từ chối).
- `rule_version = v1-2026-11-04`.

### 1.1. Luật (áp theo thứ tự)

| Bước | Luật | Còn lại / bị loại |
|---|---|---|
| 1 | `is_concrete_noun = TRUE` (file ghi `TRUE`/`FALSE` in hoa) | 1.609 / 7.000 |
| 2 | `cefr` ∈ {A1, A2, B1} | 952 |
| 3 | `topic_code` ∈ {NC, TN, AU, DL, GI, KH, SK, HT, NG} hoặc từ thuộc danh sách vật thể lẻ `EXTRA` | loại 178 |
| 4 | Bỏ danh từ chỉ **người** (nghề, vai trò, quan hệ): regex trên `meaning_vi` + danh sách `PERSON_WORDS` | loại 71 |
| 5 | Bỏ từ **không chụp được thành một vật** (bộ phận trong cơ thể, chất khí, từ chung chung, khái niệm): `NOT_VISUAL` | loại 70 |
| 6 | Bỏ từ **đa nghĩa rõ** (hai vật khác nhau, CLIP dễ lẫn nghĩa) hoặc là **chất liệu**: `POLYSEMY` | loại 96 |
| 7 | Bỏ từ có ký tự ngoài `a–z` (từ ghép có gạch nối) | loại 2 (`make-up`, `t-shirt`) |
| (a) | Bỏ **nơi chốn / cảnh lớn** — ảnh chụp cảnh chứ không chụp một vật: `PLACES_BUILT` + `PLACES_NATURE` | loại 86 |
| — | **Không cắt theo rank** (bỏ bước 8 của bản đề xuất) | **449 nhãn** |

- 449 nhãn: A1 80 · A2 160 · B1 209. Theo chủ đề: NC 148, AU 82, TN 68, DL 35, GI 32, NG 28, KH 17, GT 12, SK 8, HT 7, XH 3, KG 3, TG 2, KT 2, CT 2.
- **Giữ bộ phận cơ thể** (28 từ, NG) dù CLIP có thể lẫn từ gần nhau (cheek/chin) — theo quyết định của Hiếu.
- Một từ thuộc nhiều danh sách thì bị loại ở bước đầu tiên khớp; số "loại" ở bảng là số thực tế trên 952 từ của bước 2.

### 1.2. Danh sách chọn tay (nguyên văn, khớp hằng số trong `scripts/build_vision_labels.py`)

**Bước 3 — `EXTRA`** (vật thể lẻ ở chủ đề khác, được giữ lại; `bridge` sau đó vẫn bị loại ở bước (a)) (26): `arrow`, `bridge`, `calendar`, `cash`, `clock`, `coffin`, `coin`, `crown`, `diary`, `flag`, `fountain`, `gift`, `globe`, `gun`, `letter`, `magazine`, `mailbox`, `newspaper`, `parcel`, `phone`, `postcard`, `radio`, `stamp`, `sword`, `telephone`, `tv`

**Bước 4 — người.** Regex trên `meaning_vi` (viết thường, khớp đầu chuỗi): `người` (trừ `người máy`), `vận động viên`, `ca sĩ`, `diễn viên`, `nhạc sĩ`, `nhạc công`, `cầu thủ`, `bác sĩ`, `y tá`, `học sinh`, `sinh viên`, `giáo viên`, `thầy`, `nhà thơ`, `nhà sử`, `nhà khoa`, `nhà toán`, `nhà thiên`, `nhà hóa`, `nhà môi`, `nữ `, `nam `, `phi hành gia`, `cô gái`, `cậu bé`, `thiếu niên`, `thủ môn`, `trọng tài`, `khán giả`, `ảo thuật gia`, `tiểu thuyết gia`, `nhà soạn`, `họa sĩ`, `thợ`, `đầu bếp`. (Không dùng tiền tố chung `nhà ` vì bắt nhầm nơi chốn: nhà bếp, nhà ga, nhà hát.)

`PERSON_WORDS` (72): `actor`, `actress`, `astronaut`, `astronomer`, `athlete`, `baby`, `backpacker`, `beginner`, `boy`, `celebrity`, `champion`, `chemist`, `climber`, `clown`, `comedian`, `composer`, `creator`, `dancer`, `defender`, `dentist`, `diver`, `dj`, `doctor`, `dr`, `dragon`, `entertainer`, `environmentalist`, `examiner`, `fan`, `fighter`, `footballer`, `freshman`, `girl`, `goalkeeper`, `golfer`, `guitarist`, `headteacher`, `historian`, `instructor`, `landlord`, `learner`, `magician`, `mathematician`, `monster`, `musician`, `novelist`, `nurse`, `painter`, `performer`, `photographer`, `poet`, `psychologist`, `referee`, `runner`, `scholar`, `schoolchild`, `schoolmate`, `schoolteacher`, `singer`, `smoker`, `sophomore`, `spectator`, `superstar`, `surgeon`, `survivor`, `swimmer`, `teacher`, `teammate`, `teen`, `teenager`, `traveler`, `vet`

Thực tế bị loại ở bước 4 (71 — `baby` không nằm trong 952 từ của bước 2; regex không bắt thêm từ nào ngoài danh sách): mọi từ trên trừ `baby`.

**Bước 5 — `NOT_VISUAL`** (71): `accessory`, `alcohol`, `animal`, `award`, `body`, `brain`, `compound`, `creature`, `crossing`, `debris`, `destination`, `device`, `dioxide`, `dirt`, `dust`, `equipment`, `farmland`, `field`, `file`, `filling`, `food`, `foundation`, `fuel`, `furniture`, `garment`, `gas`, `grocery`, `ground`, `heart`, `image`, `ingredient`, `instrument`, `junk`, `kit`, `lane`, `light`, `liver`, `lung`, `machine`, `material`, `menu`, `mineral`, `nectar`, `object`, `organ`, `organism`, `package`, `photocopy`, `picture`, `plant`, `poison`, `reception`, `refreshments`, `route`, `seawater`, `server`, `skeleton`, `slot`, `starter`, `steam`, `stomach`, `takeaway`, `tool`, `track`, `trail`, `turning`, `vehicle`, `vein`, `wetland`, `wound`, `wrapping`

**Bước 6 — `POLYSEMY`** (đa nghĩa rõ hoặc chất liệu) (100): `bar`, `bark`, `bat`, `bay`, `board`, `brass`, `bronze`, `bug`, `bulb`, `bush`, `cab`, `calf`, `camp`, `can`, `cap`, `card`, `chain`, `cloth`, `coal`, `cooler`, `cotton`, `cream`, `crisp`, `crow`, `dial`, `disc`, `drill`, `dump`, `fan`, `float`, `frame`, `fry`, `glass`, `gold`, `hatch`, `horn`, `ink`, `iron`, `ivory`, `jade`, `jelly`, `jet`, `jumper`, `key`, `label`, `leather`, `lodge`, `log`, `marble`, `monitor`, `mount`, `nail`, `net`, `oil`, `palm`, `pepper`, `pipe`, `platform`, `plug`, `pool`, `pot`, `powder`, `pump`, `rail`, `ring`, `robin`, `rock`, `rubber`, `saw`, `seal`, `sheet`, `shell`, `silk`, `slice`, `star`, `starter`, `steel`, `stick`, `stone`, `straw`, `suit`, `switch`, `tablet`, `tank`, `tap`, `tape`, `terminal`, `tie`, `tile`, `tin`, `toast`, `trap`, `tube`, `turkey`, `vessel`, `ward`, `wax`, `wood`, `wool`, `wrap`

**Bước (a) — nơi chốn / cảnh lớn.**

`PLACES_BUILT` (công trình, phòng, cơ sở, đường sá) (67): `airport`, `apartment`, `avenue`, `bakery`, `balcony`, `basement`, `bathroom`, `bedroom`, `bookshop`, `bridge`, `building`, `cabin`, `cafeteria`, `campsite`, `campus`, `canteen`, `castle`, `cinema`, `classroom`, `clinic`, `college`, `crossroads`, `dam`, `disco`, `drugstore`, `entrance`, `farm`, `gallery`, `garage`, `garden`, `greenhouse`, `gym`, `hall`, `harbor`, `highway`, `hospital`, `hostel`, `hotel`, `house`, `hut`, `kitchen`, `lab`, `laboratory`, `library`, `motorway`, `museum`, `palace`, `pharmacy`, `railroad`, `railway`, `resort`, `restaurant`, `road`, `roadside`, `room`, `roundabout`, `runway`, `school`, `shelter`, `sidewalk`, `stadium`, `station`, `studio`, `theater`, `tower`, `university`, `zoo`

`PLACES_NATURE` (cảnh thiên nhiên) (19): `beach`, `cave`, `cliff`, `desert`, `forest`, `island`, `jungle`, `mountain`, `mountaintop`, `ocean`, `pond`, `rainforest`, `reef`, `river`, `sea`, `shore`, `valley`, `volcano`, `waterfall`

## 2. Mô hình

- `transformers.CLIPModel` + `CLIPProcessor`, `openai/clip-vit-base-patch32`, **ghim revision `3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268`** (đọc metadata HF Hub 2026-11-04). Dùng `transformers` đã có trong `requirements.txt`; không thêm `open_clip`. CPU, `torch.no_grad()`, `model.eval()`.
- Ở revision này trọng số chỉ có `pytorch_model.bin` (605.247.071 byte, fp32, định dạng pickle), **không có `.safetensors`**. Ghi nhận rủi ro; spike đo dung lượng thực tế trên đĩa.
  - **Quyết định 2026-11-04 (Hiếu, trước khi tải mô hình)**: giữ `pytorch_model.bin` ở `main` @ `3d74acf9…` của repo gốc. KHÔNG dùng các PR cộng đồng `refs/pr/40…59` có `model.safetensors` (chưa được repo gốc merge, ai cũng mở được → rủi ro chuỗi cung ứng). Nạp an toàn: transformers 5.22 gọi `torch.load(..., weights_only=True)` mặc định (đã kiểm mã nguồn `modeling_utils.py`), không chạy mã tuỳ ý trong pickle.
- **Pillow** cần cho `preprocess.py`: thêm `Pillow==12.3.0` vào `requirements.txt` (Hiếu duyệt 2026-11-04; trước đó chỉ có trong `.venv` qua matplotlib).
- Vector nhãn: ensemble 3 template `"a photo of a {w}."`, `"a close-up photo of a {w}."`, `"a photo of the {w}."` — mã hoá từng câu, chuẩn hoá L2, lấy trung bình 3 vector rồi chuẩn hoá lại. **Tính sẵn MỘT lần**, lưu `.npy` + manifest (model, revision, template, số nhãn, sha256 tập nhãn, `rule_version`); không encode lại text mỗi lần dự đoán (CLAUDE.md quy tắc 5). Template chốt ở đây, **không chỉnh theo ảnh mẫu**.
- Dự đoán: vector ảnh chuẩn hoá L2 → logit = `logit_scale.exp()` × cosine → softmax trên 449 nhãn → top-5 `{word, score}`.

## 3. Tiêu chí spike (ghi số đo, không đặt ngưỡng đạt/trượt)

Spike chạy trên ảnh trong `data/vision_samples/`; nhãn đúng của ảnh = phần tên file trước dấu `_` đầu tiên (vd `banana_01.jpg` → `banana`). Ảnh có nhãn đúng không thuộc 449 nhãn: báo riêng, không tính vào top-k.

| Số đo | Cách đo |
|---|---|
| top-1, top-5 | Tỉ lệ ảnh có nhãn đúng ở hạng 1 / trong 5 hạng đầu, trên ảnh có nhãn thuộc tập |
| Độ trễ CPU / ảnh | ms từ lúc mở file tới top-5, `torch.set_num_threads(2)` (Space 2 vCPU); **bỏ lần đầu** (làm nóng); báo p50, p95, max |
| RAM tăng thêm | RSS trước khi nạp mô hình → sau khi nạp + dự đoán hết ảnh (MiB) |
| Dung lượng mô hình | Byte trên đĩa của file trọng số đã tải (+ tokenizer/processor) và của `.npy` nhãn |
| Thời gian tính vector nhãn | Một lần, 449 × 3 câu |

- Kết quả ghi `reports/152_spike.json` (+ in top-5 từng ảnh). Quyết định có đưa CLIP vào dịch vụ hay không là việc sau spike, do Hiếu quyết, dựa trên các số trên.
- Ảnh mẫu > 2 MB/ảnh thì đưa vào `.gitignore`.
- **Trạng thái 2026-11-04**: `data/vision_samples/` chưa có ảnh → chưa chạy spike, chưa tải mô hình.
