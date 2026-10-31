# Nhật ký quyết định kỹ thuật — ai-service

Ghi lại VÌ SAO chọn, không chỉ chọn gì. Đến đợt 11 viết báo cáo, file này là nguyên liệu sẵn có.
Mỗi mục 5 dòng là đủ. Ghi ngay lúc quyết định, đừng để cuối kỳ nhớ lại.

## Mẫu

### [Ngày] — Tiêu đề quyết định

- **Bối cảnh**: đang vướng gì
- **Các phương án đã cân nhắc**: A, B, C
- **Chọn**: phương án nào
- **Lý do**: điều gì quyết định lựa chọn, trong ràng buộc 6 tuần và ngân sách dưới 500k
- **Đánh đổi đã chấp nhận**: mất gì khi chọn như vậy
- **Sẽ xem lại nếu**: điều kiện nào khiến quyết định này không còn đúng

---

### (Ngày) — Tự cài DSR bằng PyTorch thay vì dùng thư viện py-fsrs

- **Bối cảnh**: cần mô hình dự báo quên, đã có thư viện tham chiếu sẵn
- **Các phương án**: gọi py-fsrs · tự cài 17 tham số bằng PyTorch · dùng mô hình chuỗi thời gian tổng quát
- **Chọn**: tự cài bằng PyTorch
- **Lý do**: yêu cầu học phần là xây AI thật, không chỉ gọi thư viện; và tự cài mới huấn luyện được trên dữ liệu riêng. py-fsrs vẫn giữ làm bản đối chiếu kiểm tra công thức.
- **Đánh đổi**: tốn thêm khoảng 8 giờ ở đợt 3, rủi ro sai công thức
- **Sẽ xem lại nếu**: đến hết đợt 4 mô hình vẫn không thắng nổi SM-2

### (Ngày) — CLIP zero-shot thay vì huấn luyện bộ phân loại ảnh riêng

- **Bối cảnh**: cần nhận diện vật thể trong ảnh người học chụp
- **Chọn**: CLIP zero-shot, tự vận hành trên máy chủ nhóm
- **Lý do**: không có dữ liệu ảnh gán nhãn, không có ngân sách gọi API nhận diện ngoài; zero-shot cho phép đổi tập nhãn mà không huấn luyện lại
- **Đánh đổi**: CLIP nhìn toàn ảnh, dễ bỏ sót vật nhỏ ở góc. Chấp nhận đổi độ phủ lấy sự đơn giản.
- **Sẽ xem lại nếu**: Precision@5 dưới mức chấp nhận được trên tập 50 ảnh kiểm tra

### 2026-09-28 — Nạp `params.json` từ HF Hub thay vì `best.pt` (WSEA-81)

- **Bối cảnh**: dịch vụ cần 17 trọng số đã huấn luyện lúc khởi động. Trên Hub có sẵn cả `best.pt` (checkpoint đầy đủ) lẫn `params.json` (chỉ 17 số).
- **Các phương án**: tải `best.pt` rồi `torch.load` · tải `params.json` rồi `json.load` · nhúng thẳng trọng số vào mã nguồn
- **Chọn**: `params.json`
- **Lý do**: file ~500 byte thay vì cả checkpoint kèm `state_dict` và config — Space free khởi động nhanh hơn. Quan trọng hơn: `torch.load` trên một file tải từ mạng có thể thực thi mã tuỳ ý; đọc JSON thì không. Nhúng vào mã nguồn thì mỗi lần huấn luyện lại phải sửa code và build lại image.
- **Đánh đổi**: mất `epoch`/`val_loss` trong checkpoint — nhưng `params.json` đã chép sẵn hai trường đó. Và phải giữ `push_weights.py` luôn sinh `params.json` cạnh `best.pt`.
- **Sẽ xem lại nếu**: sau này cần nạp cả kiến trúc mô hình chứ không chỉ 17 tham số.

### 2026-09-28 — Nạp trọng số thất bại thì trả 503, không rơi về trọng số mặc định (WSEA-81)

- **Bối cảnh**: mất mạng, thiếu `HF_TOKEN`, hoặc repo đổi quyền đều làm dịch vụ không lấy được trọng số v1.
- **Các phương án**: (a) âm thầm dùng `DEFAULT_W` chưa huấn luyện · (b) `raise` trong `lifespan` cho container chết · (c) khởi động được nhưng báo degraded
- **Chọn**: (c) — `models["fsrs"] = None`, `/health` trả **503** với `status="degraded"`, `/predict-retention` trả **503**.
- **Lý do**: (a) nguy hiểm nhất — `DEFAULT_W` vẫn cho ra con số trông hợp lý, nên lỗi sẽ sống sót qua cả buổi bảo vệ mà không ai phát hiện. (b) làm HF Spaces restart liên tục, `/health` cũng chết nên không chẩn đoán được từ xa. (c) hỏng rõ ràng, đúng mã lỗi, backend dùng fallback TypeScript (NF-12).
- **Đánh đổi**: chức năng ôn tập chạy bằng công thức dự phòng `simple-scheduler.ts` phía backend trong lúc sự cố (sửa 2026-10-11: không phải SM-2, xem mục cùng ngày), số liệu kém hơn DSR. Chấp nhận được vì luồng học không đứt.
- **Sẽ xem lại nếu**: có cách lưu trọng số kèm trong image một cách an toàn, lúc đó fallback cục bộ mới đáng tin.

### 2026-09-28 — `interval_days` làm tròn (`round`) chứ không làm tròn lên (`ceil`) (WSEA-81)

- **Bối cảnh**: `I = S/FACTOR · (R_target^(1/DECAY) − 1)` cho ra số thực, phải quy về số ngày nguyên.
- **Các phương án**: `ceil` (luôn lên) · `floor` (luôn xuống) · `round`
- **Chọn**: `round`, kẹp trong `[1, FSRS_MAX_INTERVAL]`.
- **Lý do**: `ceil` nghe có vẻ an toàn nhưng đẩy lịch ôn ra xa. Với `S' = 1,1` thì `ceil` cho 2 ngày, lúc đến hạn `R ≈ 0,84` — đã tụt dưới ngưỡng 0,9 trước khi người học kịp ôn. Nguyên tắc của dự án là nghiêng về ôn sớm: sai theo hướng ôn sớm chỉ tốn thời gian, sai theo hướng ôn muộn là người học quên.
- **Đánh đổi**: `S' = 1,6` vẫn được làm tròn lên 2 ngày. Sai lệch tối đa nửa ngày, chấp nhận được.
- **Sẽ xem lại nếu**: đo được rằng người học thực tế ôn trễ so với ngày đến hạn — lúc đó nên chuyển sang `floor`.

### 2026-09-28 — Bỏ `due_date` khỏi hợp đồng API (WSEA-81)

- **Bối cảnh**: hợp đồng v0.1 để dịch vụ AI trả cả `due_date`.
- **Chọn**: chỉ trả `interval_days`; backend tự cộng vào ngày hiện tại.
- **Lý do**: Space chạy UTC còn người học ở GMT+7. Dịch vụ AI không biết múi giờ lẫn giờ học của từng người, nên tính hộ là chắc chắn lệch một ngày với người ôn buổi tối. Backend đã có thông tin đó.
- **Đánh đổi**: backend làm thêm một phép cộng ngày. Rẻ hơn nhiều so với đi tìm lỗi lệch múi giờ.
- **Sẽ xem lại nếu**: dịch vụ AI nhận được múi giờ người học trong request.

### 2026-09-28 — `extra="forbid"` cho mọi schema đầu vào (WSEA-81)

- **Bối cảnh**: mặc định Pydantic bỏ qua trường lạ trong JSON.
- **Chọn**: `extra="forbid"` + `allow_inf_nan=False`.
- **Lý do**: đã kiểm chứng rằng gõ sai `stabilty` hoặc gửi camelCase `elapsedDays` **không báo lỗi gì** — trường bị bỏ qua, thẻ cũ bị coi là thẻ mới và trả về khoảng ôn sai hoàn toàn. Một lỗi im lặng kiểu này rất khó tìm khi tích hợp với backend.
- **Đánh đổi**: backend không thể gửi thêm trường phụ để dùng dần; mỗi trường mới phải sửa hợp đồng trước. Đó là hành vi mong muốn.
- **Sẽ xem lại nếu**: không.

### 2026-10-11 — Cài SM-2 theo đặc tả gốc, không theo đoạn mã trong cẩm nang (WSEA-67)

- **Bối cảnh**: cần đường cơ sở cổ điển để so với DSR. Đoạn mã SM-2 trong cẩm nang mục 2.1 lệch đặc tả gốc ở 2 chỗ.
- **Các phương án**: theo cẩm nang · theo đặc tả gốc (Wozniak 1990)
- **Chọn**: đặc tả gốc — khi quên (q < 3) KHÔNG đổi hệ số dễ EF; khoảng cách làm tròn LÊN. Đổi 4 nút: Chưa nhớ→1, Khó→3, Bình thường→4, Dễ→5.
- **Lý do**: báo cáo ghi "SM-2" thì phải đúng SM-2. Vì EF không đổi khi quên, mọi giá trị < 3 cho "Chưa nhớ" đều ra cùng kết quả; lựa chọn thật sự chỉ là Khó→3. Đặc tả gốc không có ví dụ số nên test tự tính tay.
- **Đánh đổi**: không so được trực tiếp với các bài viết dùng biến thể SM-2 của Anki.
- **Sẽ xem lại nếu**: hội đồng yêu cầu so với biến thể SM-2 khác.

### 2026-10-11 — SM-2 không phải fallback của backend; fallback là `simple-scheduler.ts` (WSEA-67)

- **Bối cảnh**: hợp đồng API v0.2 ghi fallback backend phải là SM-2.
- **Chọn**: backend giữ `simple-scheduler.ts`; SM-2 chỉ cài bằng Python trong `evaluation/` làm đường cơ sở.
- **Lý do**: fallback chỉ cần giữ app chạy khi dịch vụ AI chết. Đường cơ sở thì phải chạy cùng dữ liệu, cùng pipeline đánh giá với DSR, tức là trong Python. SRS UC010 luồng 1a chỉ yêu cầu "công thức dự phòng viết bằng TypeScript". Đã thống nhất với Thạc Duy Anh.
- **Đánh đổi**: không có số liệu offline cho chính công thức fallback.
- **Sẽ xem lại nếu**: cần đo chất lượng lịch ôn trong thời gian sự cố.

### 2026-10-11 — Quy đổi SM-2 sang xác suất: khoảng SM-2 làm độ bền S (WSEA-67)

- **Bối cảnh**: SM-2 chỉ cho khoảng ôn, không cho xác suất, nên không tính được log-loss/AUC (vấn đề mở #2).
- **Các phương án**: coi khoảng I là độ bền S rồi áp cùng R(t, S) của DSR · hàm mũ `0.9^(t/I)`
- **Chọn**: I làm S, cùng công thức `R = (1 + 19/81 · t / S)^(−0.5)` (cẩm nang mục 5.4).
- **Lý do**: dùng chung một đường cong quên với DSR thì khác biệt chỉ còn ở cách cập nhật trạng thái. Mọi cách quy đổi hợp lý đều là hàm đơn điệu của t/I, nên AUC không đổi.
- **Đánh đổi**: log-loss và RMSE của SM-2 phụ thuộc lựa chọn này — phải ghi rõ trong báo cáo.
- **Sẽ xem lại nếu**: hội đồng cho rằng cách quy đổi làm SM-2 bị thiệt.

### 2026-10-11 — Quy trình đánh giá trên tập test (WSEA-67)

- **Bối cảnh**: tập test chỉ được dùng một lần (quy tắc 2), kết quả phải tin được với chỉ 60 người dùng.
- **Chọn**: (1) mô hình hằng số lấy p0 từ tập train; (2) DSR chạy bằng đúng `params.json` v1 của endpoint; (3) kiểm tra "ống đo" trên tập val, phải khớp `report.json` tới 1e-6 trước khi mở test; (4) khoảng tin cậy 95% bootstrap theo người dùng, 1.000 lần, seed 42; (5) dùng chung `training/metrics.py` với lúc huấn luyện.
- **Lý do**: lấy p0 từ chính tập đánh giá là nhìn trộm đáp án. Các lượt ôn của cùng một người không độc lập nên lấy mẫu lại theo lượt sẽ cho khoảng tin cậy hẹp giả.
- **Đánh đổi**: không tinh chỉnh DSR theo kết quả test, kể cả khi thấy chỗ yếu (thẻ mới, mục 6.1.1 `PROGRESS.md`).
- **Sẽ xem lại nếu**: có thêm dữ liệu người dùng để tách một tập test mới.

### 2026-10-15 — Triển khai dịch vụ AI lên Render gói `0.5c-512mb` thay vì Hugging Face Spaces (Jira WSEA-82)

- **Trạng thái**: ĐÃ THAY bởi mục 2026-10-19 (quay lại HF Spaces). Giữ lại để ghi lý do cho báo cáo.

- **Bối cảnh**: kế hoạch ban đầu dùng HF Spaces CPU basic miễn phí. Từ khoảng tháng 7/2026 HF yêu cầu gói trả phí (PRO 9 USD/tháng) mới tạo được Space Gradio hoặc Docker; trang tạo Space của tài khoản `Hieusss` gắn nhãn "Paid" cho Docker (kiểm chứng 2026-10-11).
- **Các phương án đã cân nhắc**: (a) HF PRO 9 USD/tháng, 2 vCPU/16 GB, vẫn ngủ khi không dùng · (b) Space Gradio trên ZeroGPU miễn phí — chỉ Gradio SDK, phải thêm hàm `@spaces.GPU` giả, Python 3.10/3.12 · (c) Render free — 0,1 CPU/512 MB, ngủ sau 15 phút, 750 giờ/workspace dùng chung với backend · (d) Render `0.5c-512mb` 7 USD/tháng.
- **Chọn**: (d).
- **Lý do**: không ngủ nên hết cold start (backend chỉ chờ 3 giây); hợp đồng API v0.2 không đổi, backend chỉ đổi `AI_SERVICE_URL`; Dockerfile giữ nguyên; build thẳng từ repo GitHub (Root Directory `ai-service`) thay vì đẩy sang repo git riêng của Space; backend của nhóm đã chạy trên Render; rẻ hơn (a). Loại (b) vì chắp vá và HF ghi rõ có thể lỗi bất ngờ. Loại (c) vì cold start khoảng 1 phút, và đặt chung workspace với backend sẽ vượt quota, làm dừng cả backend.
- **Đánh đổi đã chấp nhận**: chỉ 512 MB RAM (HF có 16 GB) — torch phải đo trước, CLIP + e5 + reranker gần như chắc không vừa; chi phí khoảng 7 USD/tháng trong ngân sách 500.000đ.
- **Sẽ xem lại nếu**: đo Docker ở 512 MB thấy torch không vừa (dự phòng: suy luận bằng numpy, huấn luyện vẫn PyTorch — cần Hiếu duyệt), hoặc ở đợt 7 đo e5/CLIP thấy cần nhiều RAM hơn (nâng `1c-2g` 25 USD/tháng cho mấy đợt cuối; Render tính tiền theo giây).

### 2026-10-19 — Quay lại Hugging Face Spaces (Docker, CPU basic, gói PRO 9 USD/tháng) cho dịch vụ AI (Jira WSEA-82)

- **Bối cảnh**: 15/10 chọn Render `0.5c-512mb`. Đo ngày 17/10: DSR dùng ~198 MiB, còn ~314 MiB. Ước tính CLIP ViT-B-32 + e5-small ở fp32 cần thêm khoảng 800 MB → không vừa 512 MB; muốn vừa phải chuyển sang ONNX int8 (vẫn sát mép) hoặc thuê thêm service. Đợt 7 đang quá tải.
- **Các phương án đã cân nhắc**: (a) Render 1 service, tối ưu ONNX cho vừa 512 MB · (b) Render 2 service (DSR riêng, CLIP + e5 riêng) · (c) Render nâng `1c-2g` 25 USD/tháng · (d) HF Spaces PRO 9 USD/tháng, CPU basic 2 vCPU / 16 GB.
- **Chọn**: (d). Một Space chứa cả 3 chức năng AI.
- **Lý do**: 16 GB chứa thoải mái DSR + CLIP + e5 + reranker ở fp32, không tốn công ONNX, không phải tách service; Dockerfile, README (khối YAML) và docstring vốn viết cho HF nên gần như không sửa code; tài liệu đã nộp (01, 13, 15) vốn ghi HF Spaces nên không phải đính chính; trọng số đã ở HF Hub cùng tài khoản.
- **Đánh đổi đã chấp nhận**: Space ngủ sau 48 giờ không có request → ping `/health` mỗi ngày (job của Bình); Space khởi động lại khi đẩy bản mới, sửa Settings hoặc HF bảo trì → mỗi lần mất vài phút, dự báo quên có fallback `simple-scheduler.ts`, ảnh và trợ lý thì không; PRO trả trọn tháng (9 USD) chứ không theo giây; triển khai bằng cách đẩy `ai-service/` sang repo git riêng của Space, không tự build từ GitHub; không chọn được vùng đặt máy chủ (độ trễ từ backend Singapore cao hơn, vẫn trong 3 giây).
- **Sẽ xem lại nếu**: Space khởi động lại thường xuyên hơn mức chịu được trong đợt 8–10, hoặc thời gian khởi động khi nạp đủ CLIP + e5 vượt vài phút.

### 2026-10-22 — Tối ưu hiệu năng `/predict-retention`: đo trước, chỉ làm phần có số chứng minh (Jira WSEA-97)

- **Bối cảnh**: task gốc (file `TASKS.md` ghi WSEA-80) định sẵn 3 việc: đo từng bước, xử lý theo lô, thêm bộ nhớ đệm. Đo bằng header `Server-Timing` + `scripts/bench_latency.py` trên laptop (21/10) và trên Space từ Việt Nam (22/10), số đầy đủ ở `PROGRESS.md` mục 6.1.3. Kết quả chính: lô 500 trên Space giữ kết nối, client p50 2.705 ms nhưng app p50 24 ms, model ~0,8 ms → **99% thời gian nằm ngoài ứng dụng** (mạng Việt Nam → HF, TLS, proxy, gửi/nhận 46,5 KB / 69,3 KB JSON).
- **Các phương án đã cân nhắc**: (1) bộ nhớ đệm kết quả · (2) tối ưu Pydantic / bỏ `response_model` · (3) tái sử dụng kết nối HTTPS phía backend · (4) giới hạn cỡ lô · (5) xử lý theo lô · (6) đo thường trực bằng `Server-Timing`.
- **Chọn** (6 quyết định):
  - **a. Không thêm bộ nhớ đệm kết quả.** Khoá đệm phải là `(S, D, elapsed_days, rating)`, đều là số thực đổi theo từng lượt ôn → tỷ lệ trúng ~0. Kể cả trúng 100%, phần tiết kiệm được là bước model (~0,3 ms trên laptop, ~0,7 ms trên Space), ≤ 0,2% tổng thời gian backend thấy (lô 1 trên Space: 0,66/1.153 ms ≈ 0,06% với kết nối mới, 0,63/297 ms ≈ 0,2% khi giữ kết nối). Rủi ro: trả kết quả cũ sau khi đổi trọng số (`params.json` v1 → v2). Thay bằng tái sử dụng kết nối (mục c).
  - **b. Không tối ưu Pydantic, không bỏ `response_model`.** Phía máy chủ, lô 500: app ~4,4 ms (laptop) / 24–46 ms trên Space khi giữ kết nối — app gồm cả nhận body và parse/validate Pydantic; riêng tổng 4 khoảng tensor + model + check + build chỉ ~1,7 ms (laptop) / ~2,8 ms (Space) — so với 1.000–1.800 ms ngoài ứng dụng — tối ưu phần này không đổi được trải nghiệm. `response_model` là lưới an toàn cuối: chặn S/D ra khỏi khoảng hợp lệ trước khi backend ghi vào cơ sở dữ liệu của người học.
  - **c. Khuyến nghị backend giữ kết nối HTTPS (keep-alive) tới Space.** Lô 1 thẻ từ Việt Nam: p50 1.153 → 297 ms (−74%), p95 2.622 → 424 ms. undici (`fetch` của Node) mặc định đóng kết nối rảnh sau khoảng 4 s, trong khi người học bấm thẻ cách nhau 5–15 s → backend cần tăng `keepAliveTimeout` (vd dùng `Agent` riêng của undici) thì keep-alive mới có tác dụng. Phải đo lại ở Jira WSEA-83: độ trễ từ máy chủ backend trên Render (RTT khác Việt Nam), và proxy của HF giữ kết nối rảnh được bao lâu (chưa biết — keep-alive phía backend chỉ có tác dụng trong giới hạn đó). **Chỉ khuyến nghị, chưa sửa backend** — báo Thạc Duy Anh.
  - **d. Lô lớn (replay ở hợp đồng v0.3): tối đa ~100 thẻ/lần, hoặc timeout riêng dài hơn 3 s.** Lô 500 từ Việt Nam p95 dao động 2,2–7,8 s tuỳ chất lượng mạng (bench 22/10: p95 2.167 ms giữ kết nối; smoke test 22/10 14:35: p95 7.802 ms), vượt timeout 3 s.
  - **e. Xử lý theo lô: đã có từ WSEA-81, WSEA-97 chỉ đo xác nhận.** `_to_tensors` gom cả lô thành tensor một lần, `predict_step` vector hoá, không vòng lặp từng thẻ (quy tắc 11). 50 thẻ trong 1 request so với 50 request × 1 thẻ (giữ kết nối, trung vị 5 lần): chênh ×37,2 trên laptop (1,54 so với 57,1 ms) và ×39,9 trên Space (585 ms so với 23,4 s).
  - **f. Thêm header `Server-Timing` ở response 200 của `/predict-retention`** (`tensor`, `model`, `check`, `build`, `app`, đơn vị ms) để tách thời gian máy chủ khỏi mạng ở mọi lần đo sau. Middleware viết dạng ASGI thuần, không dùng `BaseHTTPMiddleware` vì lớp đó tự thêm overhead (tạo task, chuyển body qua hàng đợi) làm sai chính số đang đo; không bắt ngoại lệ nên 401/422/500/503 giữ nguyên.
- **Lý do chung**: chỉ tối ưu chỗ chiếm thời gian. Phần tính toán phía máy chủ chỉ chiếm khoảng 0,5–5% tổng thời gian nên mọi tối ưu trong ứng dụng gần như vô hình với người học; phần đáng làm nằm ở đường mạng.
- **Đánh đổi đã chấp nhận**: không có con số "cải thiện" nào trong dịch vụ AI để đưa vào báo cáo — mức −74% phụ thuộc backend làm theo mục c. `Server-Timing` lộ thời gian xử lý nội bộ cho bên gọi đã có khoá (request không khoá không có header).
- **Sẽ xem lại nếu**: thêm mô hình nặng (CLIP, e5) khiến phần máy chủ chiếm đáng kể; đo từ backend trên Render (WSEA-83) cho thấy mạng nhanh hơn nhiều và phần máy chủ thành nút thắt; hoặc backend không giữ được kết nối.

### 2026-10-29 — Kho tri thức ngữ pháp: JSONL 9 trường, chia theo (chủ đề × khía cạnh) (Jira WSEA-100)

- **Bối cảnh**: trợ lý cần một kho tri thức ngữ pháp để truy hồi ngữ nghĩa (RAG); đầu ra của task là 100 đoạn, nạp vào bảng `kb_chunks` của từng môi trường. Mô hình vector dự kiến là `intfloat/multilingual-e5-small`, chỉ đọc tối đa 512 token mỗi đoạn.
- **Các phương án đã cân nhắc**: (a) CSV · (b) Markdown, mỗi đoạn một mục · (c) JSONL, mỗi dòng một đoạn · (d) ngoài ngữ pháp, nhờ LLM sinh thêm đoạn giải thích cho 7.000 từ vựng.
- **Chọn**: (c). `kb/grammar_chunks.jsonl`, 9 trường: `id, topic, facet, title, cefr, source, source_url, content, reviewed_by`. Mỗi đoạn là một cặp (chủ đề × khía cạnh); khía cạnh là `form | usage | signals | contrast | mistakes`. Mỗi đoạn dài 120–250 từ, dòng 1 của `content` là tiêu đề đầy đủ, và tối đa 512 token e5 khi đo trên chuỗi `"passage: " + content`. Kho gồm 75 đoạn ngữ pháp và 25 đoạn phân biệt từ dễ nhầm. `scripts/validate_kb.py --final` kiểm tự động; minh chứng ở `docs/kb/report.json`: 0 lỗi, 189–249 từ, tối đa 391 token.
- **Quy trình nội dung**: LLM soạn nháp → đối chiếu Wikipedia/Wiktionary (CC BY-SA 4.0, ghi ở `source`, `source_url`) → Claude soát lần hai → Hiếu duyệt từng đoạn (`reviewed_by`). Không chép nguyên văn nguồn nào; British Council và Cambridge chỉ dùng để tra cứu.
- **Lý do**: `content` nhiều dòng, có dấu phẩy và ngoặc kép, nên CSV phải escape và dễ hỏng khi sửa tay. Markdown dễ đọc nhưng siêu dữ liệu phải tự đặt quy ước và khó kiểm tự động; vì vậy `preview.md` được sinh từ JSONL để người duyệt đọc. JSONL mỗi dòng một bản ghi nên diff git rõ, script kiểm được từng dòng, và nạp thẳng vào `kb_chunks`. Chia theo chủ đề × khía cạnh để mỗi đoạn trả lời một kiểu câu hỏi, vector không bị pha nhiều ý. Đoạn 120–250 từ tương đương khoảng 250–390 token, dưới trần 512 nên không bị cắt. Loại (d) vì 7.000 đoạn sinh tự động không thể duyệt kịp trong 6 tuần. **Từ vựng không đưa vào kho này** mà dùng `backend/prisma/data/vocab_7000.csv`, vốn đã có nghĩa và ví dụ.
- **Đánh đổi đã chấp nhận**: 100 đoạn chỉ phủ các chủ điểm phổ biến A1–B2. Chất lượng phụ thuộc khâu duyệt vì nháp do LLM viết. Một số điểm sắc thái Anh/Mỹ hoặc chưa thống nhất giữa các nguồn đã được ghi lại khi duyệt (042, 048, 054, 059, 080, 090, 091, 099).
- **Sẽ xem lại nếu**: khi chạy thử truy hồi (WSEA-94) có nhiều câu hỏi không tìm được đoạn phù hợp, hoặc đổi sang mô hình vector có trần token khác.

### 2026-10-29 — Môi trường dev: thêm `sentence-transformers` vào `requirements-dev.txt`, chưa đưa vào image

- **Bối cảnh**: `validate_kb.py` cần tokenizer e5 để đo token; task sinh vector (WSEA-93) sẽ dùng `sentence-transformers`.
- **Chọn**: thêm `sentence-transformers>=6.2,<7` vào `requirements-dev.txt`, **không** thêm vào `requirements.txt`.
- **Lý do**: `requirements.txt` dùng để build image chạy trên Space. Mô hình nào chạy trong Space sẽ chốt ở task sinh vector, nên chưa nên làm image nặng thêm. Đã kiểm `.venv` sau khi cài: `torch==2.14.0+cpu` và `huggingface_hub==2.0.0` giữ nguyên, có thêm `sentence-transformers 6.2.0` và `transformers 5.22.0`.
- **Đánh đổi đã chấp nhận**: môi trường dev và image tạm thời khác nhau. Thiếu `transformers` thì `validate_kb.py` chỉ in "bỏ qua đo token", riêng chế độ `--final` báo lỗi.
- **Sẽ xem lại nếu**: task sinh vector chốt chạy e5 trong Space. Khi đó chuyển gói sang `requirements.txt`, đo lại kích thước image, RAM và thời gian khởi động.

### 2026-10-29 — Kiến trúc dữ liệu chatbot: backend truy vấn pgvector, dịch vụ AI không giữ `DATABASE_URL`

- **Trạng thái**: ĐÃ CHỐT 2026-10-30 với Thạc Duy Anh. Migration `20261030155100_kb_vector_384_word_embeddings` (PR #103) đã áp lên staging 2026-10-30; giao diện ở `docs/API_CONTRACT.md` v0.3 (`POST /assistant/embed`, `POST /assistant/ask`).
- **Bối cảnh**: một HF Space phục vụ cả staging lẫn production, trong khi mỗi môi trường có project Supabase riêng (`kb_chunks`, từ vựng). Nếu dịch vụ AI tự truy vấn cơ sở dữ liệu thì phải chọn một trong hai DB, hoặc giữ cả hai chuỗi kết nối rồi định tuyến theo từng request.
- **Các phương án đã cân nhắc**: (a) dịch vụ AI giữ một `DATABASE_URL` và tự truy vấn pgvector · (b) dịch vụ AI giữ hai `DATABASE_URL`, chọn theo header môi trường · (c) dùng chung DB của backend: dịch vụ AI chỉ sinh vector, backend chạy truy vấn pgvector trên DB của môi trường mình.
- **Chọn**: (c).
- **Lý do**: Space không phân biệt môi trường. Không phải lưu khoá DB production trong Space, nên giảm chỗ có thể lộ bí mật. Mỗi môi trường tự nạp dữ liệu kho bằng script nên dữ liệu không lẫn giữa staging và production.
- **Kéo theo**: `kb_chunks.embedding` đổi từ `vector(768)` sang `vector(384)` (số chiều của `multilingual-e5-small`); thêm bảng `word_embeddings` cho từ vựng; cần migration Prisma phía backend.
- **Đánh đổi đã chấp nhận**: mỗi câu hỏi tốn thêm một lượt backend → AI để sinh vector rồi mới truy vấn. Logic truy hồi tách ra hai nơi; nếu dùng reranker thì nó phải nhận danh sách ứng viên từ backend.
- **Sẽ xem lại nếu**: tách mỗi môi trường một Space riêng, hoặc độ trễ thêm vào làm vượt ngân sách 3 giây của backend.

### 2026-10-30 — Mô hình vector `intfloat/multilingual-e5-small`, văn bản đoạn = `content` nguyên văn (Jira WSEA-110)

- **Bối cảnh**: cần mô hình sinh vector đọc được câu hỏi tiếng Việt, tiếng Anh và câu trộn, chạy CPU trên Space. Cột `kb_chunks.embedding` lúc đầu là `vector(768)`.
- **Các phương án đã cân nhắc**: `multilingual-e5-small` (384 chiều, 118M tham số) · `multilingual-e5-base` (768 chiều, 278M) · `paraphrase-multilingual-MiniLM-L12-v2` (384 chiều, chỉ đọc 128 token).
- **Luật chọn, chốt TRƯỚC khi chạy**: giữ e5-small trừ khi e5-base hơn ≥ 0,10 Recall@5 và MRR cao hơn.
- **Kết quả** (`scripts/compare_embedders.py`, 31 câu `kb/eval_questions.csv`, `docs/kb/embedder_comparison.json`): e5-small R@1 0,613 · R@5 0,839 · MRR@10 0,678 · 15 ms/câu · e5-base 0,548 · 0,839 · 0,671 · 39 ms/câu · MiniLM 0,581 · 0,774 · 0,637 (100/100 đoạn bị cắt ở 128 token).
- **Chọn**: e5-small, ghim revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`; tiền tố `query: ` / `passage: `; chuẩn hoá L2; văn bản đoạn là `content` nguyên văn. Cấu hình nằm duy nhất ở `app/services/embedder.py`, dùng chung cho script nạp và endpoint `/assistant/embed`.
- **Lý do**: e5-base không vượt ngưỡng (bằng R@5, thấp hơn MRR) mà nặng gấp 2,4 và chậm gấp 2,6 lần. Chênh giữa các mô hình chỉ 1–2 câu trên 31, tức là mức nhiễu, nên quyết định theo luật đã chốt và chi phí chạy trên CPU.
- **Thí nghiệm âm**: thêm tên chủ đề tiếng Anh vào đầu đoạn (để cứu câu hỏi tiếng Anh) làm R@5 giảm còn 0,806 (chủ đề) và 0,774 (chủ đề + khía cạnh) → không dùng.
- **Đánh đổi đã chấp nhận**: câu hỏi tiếng Anh truy hồi yếu hơn (R@5 0,67 trên 6 câu) vì đoạn chủ yếu viết tiếng Việt. Khoảng cách cosine dồn trong dải hẹp (~0,08–0,21) nên ngưỡng "không đủ ngữ cảnh" phải hiệu chỉnh từ dữ liệu. Bộ 31 câu do Claude soạn từ tiêu đề dàn ý, Hiếu duyệt → số liệu có thể lạc quan; bộ 60 câu độc lập (đợt 8) là số chính thức.
- **Sẽ xem lại nếu**: bộ 60 câu cho R@5 < 0,7, hoặc rerank không bù được câu hỏi tiếng Anh.

### 2026-10-30 — Vector từ vựng: bảng riêng `word_embeddings`, văn bản `"{term} ({pos}): {meaning_vi}"` (Jira WSEA-110)

- **Bối cảnh**: trợ lý cần tra ngược Việt→Anh ("biết ơn tiếng Anh là gì") trên 7.000 từ của bảng `words`.
- **Các phương án đã cân nhắc**: trộn 7.000 từ vào `kb_chunks` · bảng riêng `word_embeddings(word_id → words.id)`; văn bản T1 `term (pos): meaning_vi` · T2 = T1 + câu ví dụ.
- **Chọn**: bảng riêng (migration `20261030155100_kb_vector_384_word_embeddings`, Duy Anh, PR #103); T1; `term` chuẩn hoá `strip().lower()` giống seed backend (`emb.normalize_term`).
- **Lý do**: trộn vào kho thì 7.000 dòng từ vựng lấn át 100 đoạn ngữ pháp và nhân bản dữ liệu `words`. T2 chỉ hơn 1/10 câu, làm hỏng câu khác và mã hoá chậm hơn 37%. Không chuẩn hoá thì `TRUE`/`FALSE` trong CSV (Excel viết hoa) không khớp `true`/`false` trong DB.
- **Kết quả tra ngược 10 câu**: nguyên câu top-1 4/10, top-3 7/10; bỏ cụm khung ("tiếng Anh là gì", "dịch sang tiếng Anh"…) → 7/10, 8/10. Ba câu còn trượt (improve, angry, borrow) đều khớp nguyên văn một nghĩa trong `meaning_vi`.
- **Đánh đổi đã chấp nhận**: một mình vector từ vựng chưa đủ tốt cho tra ngược.
- **Sẽ xem lại nếu / việc tiếp**: task truy hồi: bóc cụm khung câu (bước phân loại ý định) → khớp chính xác cụm khoá với từng nghĩa trong `meaning_vi` → vector chỉ là đường dự phòng; thêm `vocab.match = "meaning"` vào hợp đồng.

### 2026-10-31 — Nạp vector: mã hoá ra file một lần, nạp từng môi trường bằng script; SQL từ vựng lấy top-k trước rồi mới JOIN (Jira WSEA-110)

- **Bối cảnh**: staging và production là hai project Supabase riêng; dịch vụ AI không giữ `DATABASE_URL` (mục 2026-10-29).
- **Chọn**: `scripts/embed_kb.py` mã hoá một lần ra `data/embeddings/*.npz` + `docs/kb/embedding_manifest.json` (mô hình, revision, sha256 đầu vào và đầu ra). `scripts/load_vectors.py --env <môi trường>` kiểm sha256, manifest và schema (`vector(384)`), UPSERT trong một transaction, chạy lại không đổi kết quả, kiểm chéo top-3 SQL với numpy; production bắt buộc `--confirm-production`. Chuỗi kết nối chỉ lấy từ biến phiên `KB_DATABASE_URL` (Session pooler, cổng 5432).
- **Kết quả staging 2026-10-31** (`docs/kb/load_report_staging.json`): `kb_chunks` 100/100, `word_embeddings` 7000/7000, kiểm chéo 3/3 khớp.
- **Tốc độ** (`scripts/bench_vector_search.py`, `docs/kb/vector_bench.json`, `hnsw.ef_search` 40): `kb_chunks` 100 dòng → planner chọn Seq Scan, 0,5 ms phía server; đúng, chưa cần chỉ mục ở cỡ này. `word_embeddings` ~7.000 dòng → HNSW 0,93 ms so với tìm chính xác 12,95 ms (~14×), top-3 khớp 0,914 với tìm chính xác. Khứ hồi từ laptop ~51 ms là mạng VN → Singapore.
- **Phát hiện**: viết `JOIN words` rồi mới `LIMIT` khi tra từ vựng có lúc chậm (p50 2–13 ms, đỉnh 80 ms); lấy top-k trong truy vấn con rồi mới JOIN ổn định p50 0,89 ms, tối đa 1,2 ms → hợp đồng v0.3 dùng dạng truy vấn con.
- **Đánh đổi đã chấp nhận**: mỗi môi trường phải chạy script nạp riêng, và phải làm TRƯỚC khi deploy backend dùng cột `embedding_model`.
- **Sẽ xem lại nếu**: kho tri thức lên hàng nghìn đoạn, hoặc độ khớp ANN thấp làm giảm chất lượng (tăng `hnsw.ef_search`).

### 2026-10-31 · WSEA-111 · Truy hồi ngữ nghĩa

Số liệu truy hồi lấy từ `scripts/eval_retrieval.py` → `docs/eval/retrieval_k_sweep.json` (vector đoạn đọc từ `.npz` đã nạp DB, 31 câu dương `kb/eval_questions.csv`, 12 câu âm `kb/eval_negatives.csv`, distance = 1 − cosine = toán tử `<=>`). Đã đối chiếu với SQL thật trên staging (`eval_retrieval.py --db`, 2026-10-31 18h58): 43 câu (31 dương + 12 âm), top-1 SQL khớp numpy 1,00, nguyên thứ tự top-8 khớp 1,00, |Δdistance| max 0,000000 → số hit@k ở dưới phản ánh đúng hệ thống đang chạy. 48,68 ms (p50, max 140,82 ms) là thời gian khứ hồi từ laptop qua Session pooler, gồm mạng VN→Singapore, không phải thời gian truy vấn; phía server < 1 ms (`docs/kb/vector_bench.json`).

#### a. `/assistant/embed`: nạp e5-small một lần lúc khởi động, mã hoá trong threadpool, `/health` chỉ phụ thuộc FSRS

- **Bối cảnh**: backend cần vector câu hỏi để chạy pgvector (hợp đồng v0.3). Dịch vụ đang phục vụ `/predict-retention`, là đường không được cắt (MK-3).
- **Quyết định**: tạo `Embedder` trong `lifespan` và encode thử `"warmup"` để ép nạp mô hình ngay khi khởi động; lỗi thì `logger.exception`, `embedder = None`, dịch vụ vẫn lên (giống `load_fsrs`). Endpoint gọi `encode_queries` qua `run_in_threadpool`. `/health` trả 503 + `degraded` **chỉ khi thiếu `fsrs`**; `models` liệt kê mọi mô hình đã nạp.
- **Lý do**: nạp lười ở request đầu sẽ vượt timeout 5 s của backend. Encode chạy CPU nặng; để trên event loop thì chặn mọi request khác — đo: `/predict-retention` vẫn trả 200 trong 75 ms khi 8 request embed dài chạy song song. Dự báo quên là đường KHÔNG CẮT; embedder hỏng thì chính `/assistant/embed` trả 503 và backend fallback, không lý do gì để job ping và smoke test coi cả dịch vụ là hỏng.
- **Hệ quả**: `/health` có thể trả 200 với `models: ["fsrs"]` khi embedder hỏng → muốn biết trợ lý có chạy không phải xem `models` chứa `"embedder"`. pytest đặt `EMBEDDER_ENABLED=false` để không nạp torch; test dùng mô hình giả.

#### b. Nướng mô hình vào image Docker, chỉ embedder đọc cache cục bộ

- **Bối cảnh**: Space khởi động lại khi deploy, sửa Settings hoặc HF bảo trì; tải mô hình từ Hub mỗi lần khởi động thì chậm và phụ thuộc mạng.
- **Quyết định**: `snapshot_download` lúc build, revision ghim lấy từ `app/services/embedder.py` (một nguồn sự thật, không chép vào Dockerfile); lớp tải mô hình chỉ phụ thuộc 3 file `app/__init__.py`, `app/services/__init__.py`, `app/services/embedder.py`; tải bằng `appuser`, không `chown -R`. Đặt `EMBEDDER_LOCAL_FILES_ONLY=true`; **không** dùng `HF_HUB_OFFLINE` toàn cục. Ghim `sentence-transformers==6.2.0`, `transformers==5.22.0`, `tokenizers==0.23.3` = đúng bản đã sinh vector nạp DB.
- **Lý do**: `HF_HUB_OFFLINE` chặn cả `load_fsrs`, vốn tải `params.json` từ Hub lúc khởi động. Đổi bản thư viện có thể làm vector lúc hỏi lệch vector đã lưu. `transformers` 5.22.0 cần Python ≥ 3.11.0 → không được hạ Python của image (đang `python:3.11-slim`).
- **Hệ quả** (đo Docker `--cpus=2 -m 2g`): image 2,81 GB (trước 1,54 GB; lớp mô hình 494 MB), khởi động 14,4 s, nạp embedder 6,0 s, RAM nghỉ 710 MiB. Chạy `--network none` vẫn có embedder. Đổi mô hình hoặc revision phải sửa `embedder.py`, build lại image VÀ sinh lại toàn bộ vector.

#### c. Giữ `AI_ASSISTANT_TOP_K = 8`

- **Bối cảnh**: hợp đồng v0.3 cho backend lấy top-8 đoạn; cần số đo để giữ hay đổi.
- **Quyết định**: giữ k = 8 cho truy vấn SQL. Khi chưa có rerank, prompt nên dùng top-5 chứ không phải top-3.
- **Lý do**: hit@k với k = 1/3/5/8/10/20 là 0,613 / 0,645 / 0,839 / 0,871 / 0,871 / 0,903, MRR@20 0,681 (31 câu); 8 → 10 không tăng. Theo ngôn ngữ, hit@8: mixed 1,00 (n=13), vi 0,833 (n=12), en 0,667 (n=6). Nhiều gold nằm ở hạng 4–5 (6/31 câu: q07, q09, q24, q25 hạng 4; q19, q27 hạng 5) → từ top-3 lên top-5 tăng hit từ 0,645 lên 0,839.
- **Hệ quả**: đưa 5 đoạn vào prompt thì ngữ cảnh dài hơn top-3. Câu hỏi tiếng Anh vẫn yếu (en hit@20 0,667).

#### d. Không dùng ngưỡng distance cứng để kết luận "kho không có tài liệu"

- **Bối cảnh**: hợp đồng giao cho dịch vụ AI quyết định "không đủ ngữ cảnh". Cần biết một ngưỡng distance top-1 có tách được câu không có tài liệu hay không.
- **Quyết định**: việc từ chối giao cho prompt (LLM chỉ dùng ngữ cảnh; không có thì nói chưa có và `source_ids` rỗng) + rerank ở task sau. Có thể chặn sớm khi distance top-1 > 0,22 (rõ ngoài lĩnh vực).
- **Lý do**: distance top-1 câu dương min 0,083 / p50 0,127 / p90 0,173 / max 0,199; câu âm `gap` (tiếng Anh nhưng kho chưa có) 0,120–0,155, nằm trong vùng câu dương; câu âm `off` 0,154–0,231. Ngưỡng 0,15 giữ 84% câu dương, chặn 100% câu off nhưng chỉ 20% câu gap. Ở 0,22: giữ 100% câu dương, chặn 29% câu off (n05, n07). Bằng chứng trên staging 31/10: câu "thời tiết Hà Nội hôm nay thế nào" vẫn nhận 3 nguồn gram_002 / gram_005 / gram_037.
- **Hệ quả**: chất lượng từ chối phụ thuộc prompt và rerank, phải chấm trong bộ đánh giá độ trung thực. **Hạn chế**: 31 câu dương do Claude soạn, Hiếu duyệt; 12 câu âm viết trước khi chạy, không sửa sau khi xem kết quả; bộ nhỏ nên mỗi câu dương ≈ 3 điểm phần trăm. Số chính thức là bộ 60 câu của Phúc (WSEA-124).

#### e. Giữ nguyên nhãn hai câu thất bại q02 và q08

- **Bối cảnh**: hai câu có gold ở hạng 31 trên 100 đoạn: q02 (tiếng Việt diễn đạt vòng vo "chia động từ đuôi ing cho việc đang diễn ra…", gold gram_006, top-1 gram_064) và q08 (câu tiếng Anh "Why is 'I have seen him yesterday' wrong?", gold gram_015, top-1 gram_036).
- **Quyết định**: không sửa câu hỏi hay gold sau khi xem kết quả.
- **Lý do**: sửa nhãn cho khớp kết quả là làm đẹp số liệu. Hai câu này cho thấy giới hạn của truy hồi chỉ dựa vào vector: câu diễn đạt vòng vo, và câu tiếng Anh hỏi kho viết tiếng Việt.
- **Hệ quả**: là lý do cần rerank / hybrid thêm từ khoá ở task sau; dùng lại q02, q08 để đo hiệu quả rerank.

#### f. `.gitattributes` ép LF cho `kb/*.jsonl` và `kb/*.csv`

- **Bối cảnh**: `embedding_manifest.json` và `retrieval_k_sweep.json` ghi sha256 các file này. Trên Windows `core.autocrlf=true` checkout ra CRLF → `eval_retrieval.py` (và cả `load_vectors.py`) báo sha256 của `grammar_chunks.jsonl` lệch manifest dù nội dung không đổi.
- **Quyết định**: `ai-service/.gitattributes`: `kb/*.jsonl text eol=lf`, `kb/*.csv text eol=lf`.
- **Lý do**: mã băm phải giống nhau trên mọi máy; sửa ở git thì không phải đổi script hay manifest.
- **Hệ quả**: máy đã checkout trước đó cần checkout lại các file này một lần để nhận LF.
