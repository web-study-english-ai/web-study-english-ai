# WSEA-153 — Báo cáo nhận diện ảnh → từ vựng (CLIP zero-shot)

- **Tiêu chí** (chốt trước): `docs/eval/WSEA-153_tieu_chi.md`, gồm mục 4b "Điều chỉnh trước khi chạy test" (commit `e401b0a`).
- **Hệ thống**: `openai/clip-vit-base-patch32` @ `3d74acf9…`, 449 nhãn (`kb/vision_labels.csv`), 3 template, vector nhãn tính sẵn `app/resources/`, **τ = 0,40** (khoá trên dev ở `a7d6a7c`). Cùng đường chạy với `POST /recognize/image`.
- **Tập test**: 48 ảnh web trong `data/vision_test/`, thu nhỏ cạnh dài 1024 px, sha256 ở `reports/153_test_manifest.json` (commit `cd0b755`, trước khi chạy). Thiếu `beef`, `chicken`. Không trùng ảnh dev.
- **Chạy đúng 1 lần** (`scripts/run_vision_test.py`, tự từ chối lần hai) → `reports/153_test.json`. Laptop, torch 2 luồng.

## 1. Kết quả tập test (n = 48)

| chỉ số | **chặt (chính)** | nới (nhóm đồng nghĩa) |
|---|---|---|
| top-1 | **34/48 = 0,708** | 36/48 = 0,750 |
| top-5 | **46/48 = 0,958** | 47/48 = 0,979 |
| coverage (top-1 ≥ τ) | **42/48 = 0,875** | (như chặt) |
| accuracy khi trả lời | **33/42 = 0,786** | 35/42 = 0,833 |
| độ trễ / ảnh (bỏ lần đầu 1.511 ms) | p50 **171 ms** · p95 **193 ms** · max 251 ms (n = 47) | |

Theo bậc CEFR (chặt):

| bậc | n | top-1 | top-5 | coverage | accuracy khi trả lời |
|---|---|---|---|---|---|
| A1 | 7 | 6 | 7 | 6 | 1,000 |
| A2 | 18 | 14 | 18 | 17 | 0,824 |
| B1 | 23 | 14 | 21 | 19 | 0,684 |

## 2. Ảnh sai

**Được trả lời nhưng top-1 sai (chặt)** — 9 ảnh, top-1 ≥ τ nên người học sẽ thấy câu trả lời sai mà không có cảnh báo:

| ảnh | top-1 | score | nới? |
|---|---|---|---|
| cup | mug | 0,486 | đúng (cùng nhóm) |
| sweater | pullover | 0,820 | đúng (cùng nhóm) |
| postcard | guidebook | 0,790 | sai |
| purse | handbag | 0,733 | sai (`purse` cùng nhóm `wallet`, không cùng `handbag`) |
| spoon | tablespoon | 0,640 | sai |
| tree | oak | 0,702 | sai (cha–con, không gộp theo nguyên tắc) |
| sweatshirt | tracksuit | 0,529 | sai |
| skin | shoulder | 0,485 | sai |
| shrimp | seafood | 0,421 | sai (cha–con) |

**Bị gắn `low_confidence`** (top-1 < 0,40) — 6 ảnh: beard (top-1 **đúng** 0,319), face → makeup, freezer → pc, newspaper → paper, novel → shelf, sticker → diary.
**Trượt cả top-5 (chặt)**: novel (top-5 toàn kệ sách/sách khác), sticker.

Phần lớn lỗi là **từ gần nghĩa hoặc quan hệ cha–con cùng có trong 449 nhãn** (spoon/tablespoon, tree/oak, shrimp/seafood, sweatshirt/tracksuit), không phải nhận nhầm vật hoàn toàn khác.

## 3. Ảnh ngoài 449 nhãn (dev, không dùng chọn τ)

5 ảnh vật không có trong tập nhãn (`data/vision_dev_ngoai_nhan/`, `reports/153_tau_dev.json`): **4/5 bị gắn `low_confidence`** với τ = 0,40.

| ảnh | top-1 | score | low_confidence |
|---|---|---|---|
| computer_mouse | helmet | 0,257 | có |
| notebook | diary | 0,483 | **không** |
| phone_charge | modem | 0,132 | có |
| screwdriver | razor | 0,140 | có |
| tablet | phone | 0,070 | có |

Mô hình luôn trả một nhãn trong 449 từ; với vật lạ nó chọn vật gần giống. τ chặn được phần lớn, nhưng vật rất gần một nhãn có sẵn (notebook → diary) vẫn lọt.

## 4. Đối chiếu dev (chỉ tham khảo)

Dev 18 ảnh (9 spike + 9 tự chụp): top-1 chặt 8/18 = 0,444, nới 13/18; coverage 14/18 tại τ = 0,40, accuracy khi trả lời 0,571 chặt / 0,857 nới. Tập test (ảnh web) cao hơn hẳn — xem hạn chế 1.

## 5. Hạn chế

1. **Ảnh web, không phải ảnh tự chụp** (tiêu chí 4b): ảnh có thể đã nằm trong dữ liệu huấn luyện CLIP; ảnh web thường rõ, chính diện, nền sạch. Kết quả **lạc quan**: trên dev tự chụp, top-1 chặt chỉ 0,444 so với 0,708 trên test. Không dùng số này để hứa với người dùng thật.
2. **Ảnh có chữ**: một số ảnh web có chữ/nhãn in (bìa tạp chí, báo, hộp sản phẩm). CLIP đọc được chữ trong ảnh nên có thể "đoán qua chữ" — không phải nhận diện vật thể thuần. Chưa đánh dấu ảnh nào có chữ nên không tách được ảnh hưởng.
3. **n nhỏ**: 48 ảnh, 1 ảnh/vật, 1 lần chạy — một ảnh ≈ 2,1 điểm %; theo bậc CEFR còn nhỏ hơn (A1 n = 7).
4. **Thiếu 2 vật** (`beef`, `chicken`), cả hai bậc A1 → A1 chỉ còn 7 ảnh.
5. **Nhóm đồng nghĩa rút từ lỗi spike**: cup~mug, book~textbook, computer~screen được gợi ý từ chính lỗi đã thấy ở dev → cột "nới" lạc quan; số chính là cột **chặt**. Nhóm không gộp quan hệ cha–con (tree/oak, shrimp/seafood) nên các lỗi này vẫn tính sai ở cả hai cách chấm.
6. **τ chọn từ 18 ảnh dev**, một người chụp.
7. Độ trễ đo trên laptop; Space CPU basic sẽ chậm hơn, và chưa đo RAM khi nạp cùng các mô hình khác (spike WSEA-152: CLIP +683 MiB).
