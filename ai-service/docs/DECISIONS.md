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

- **Bối cảnh**: kế hoạch ban đầu dùng HF Spaces CPU basic miễn phí. Từ khoảng tháng 7/2026 HF yêu cầu gói trả phí (PRO 9 USD/tháng) mới tạo được Space Gradio hoặc Docker; trang tạo Space của tài khoản `Hieusss` gắn nhãn "Paid" cho Docker (kiểm chứng 2026-10-11).
- **Các phương án đã cân nhắc**: (a) HF PRO 9 USD/tháng, 2 vCPU/16 GB, vẫn ngủ khi không dùng · (b) Space Gradio trên ZeroGPU miễn phí — chỉ Gradio SDK, phải thêm hàm `@spaces.GPU` giả, Python 3.10/3.12 · (c) Render free — 0,1 CPU/512 MB, ngủ sau 15 phút, 750 giờ/workspace dùng chung với backend · (d) Render `0.5c-512mb` 7 USD/tháng.
- **Chọn**: (d).
- **Lý do**: không ngủ nên hết cold start (backend chỉ chờ 3 giây); hợp đồng API v0.2 không đổi, backend chỉ đổi `AI_SERVICE_URL`; Dockerfile giữ nguyên; build thẳng từ repo GitHub (Root Directory `ai-service`) thay vì đẩy sang repo git riêng của Space; backend của nhóm đã chạy trên Render; rẻ hơn (a). Loại (b) vì chắp vá và HF ghi rõ có thể lỗi bất ngờ. Loại (c) vì cold start khoảng 1 phút, và đặt chung workspace với backend sẽ vượt quota, làm dừng cả backend.
- **Đánh đổi đã chấp nhận**: chỉ 512 MB RAM (HF có 16 GB) — torch phải đo trước, CLIP + e5 + reranker gần như chắc không vừa; chi phí khoảng 7 USD/tháng trong ngân sách 500.000đ.
- **Sẽ xem lại nếu**: đo Docker ở 512 MB thấy torch không vừa (dự phòng: suy luận bằng numpy, huấn luyện vẫn PyTorch — cần Hiếu duyệt), hoặc ở đợt 7 đo e5/CLIP thấy cần nhiều RAM hơn (nâng `1c-2g` 25 USD/tháng cho mấy đợt cuối; Render tính tiền theo giây).
