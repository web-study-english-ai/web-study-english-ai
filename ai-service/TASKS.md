# TASKS.md — Công việc của tôi theo đợt (mã WSEA)

> Nguồn mã: sheet **Nhập Jira** của `11_Ke_hoach_task_theo_dot_v2.xlsx` — 166 dòng, nhập vào Jira
> theo đúng thứ tự dòng nên dòng 1 thành `WSEA-1`, dòng 166 thành `WSEA-166`.
> **Mã dưới đây là mã DỰ KIẾN theo thứ tự nhập.** File Excel không chứa mã Jira; mã chỉ sinh ra
> lúc import. Nếu dự án đã có issue trước đó, hoặc bạn nhập lại nhiều lần, mã sẽ lệch.
> Cách kiểm chứng: vào Jira → bộ lọc `project = WSEA AND assignee = currentUser() ORDER BY key ASC`
> → xuất CSV → đối chiếu cột Summary với bảng này, rồi sửa lại mã cho đúng **một lần duy nhất**.
>
> Các bước thực hiện lấy từ file 11 (đúng nội dung mô tả trên Jira). Mục *Chi tiết kỹ thuật* lấy từ
> `12_Ke_hoach_cong_viec_AI.xlsx` (ENG-AI-001) — chi tiết hơn, dùng khi bắt tay vào code.
>
> Ký hiệu: `[ ]` chưa làm · `[~]` đang làm · `[x]` xong · `[!]` có vấn đề · `[-]` đã cắt


---

## Đợt 1 · D1–D3 — Khởi động và học công nghệ

### [ ] WSEA-1 · Tổ chức họp khởi động và thiết lập quản trị dự án
3h · Ưu tiên: High · `ai/WSEA-1-...`

- [ ] 1. Chuẩn bị chương trình họp và tài liệu khởi tạo dự án
- [ ] 2. Trình bày mục tiêu, phạm vi, phân công vai trò
- [ ] 3. Phổ biến sổ tay quy trình, thống nhất quy ước làm việc
- [ ] 4. Ghi biên bản và gửi cho cả nhóm

**Minh chứng Jira:** 

### [ ] WSEA-2 · Cấu hình Jira và nhập backlog ban đầu
3h · Ưu tiên: High · `ai/WSEA-2-...`

- [ ] 1. Tạo 12 sprint tương ứng 12 đợt, đặt tên và ngày bắt đầu kết thúc
- [ ] 2. Thêm cột Testing vào bảng, cấu hình luồng trạng thái
- [ ] 3. Tạo nhãn: ai, backend, frontend, qa, devops, docs
- [ ] 4. Nhập backlog đợt 1 và đợt 2, gán người thực hiện

**Minh chứng Jira:** 

### [ ] WSEA-3 · Tự học FastAPI và cách đóng gói mô hình thành dịch vụ
6h · Ưu tiên: High · `ai/WSEA-3-...`

- [ ] 1. Đọc tài liệu FastAPI: routing, dependency, response model
- [ ] 2. Thực hành viết một API đơn giản trả về JSON
- [ ] 3. Tìm hiểu cách nạp mô hình vào bộ nhớ khi khởi động ứng dụng
- [ ] 4. Đọc tài liệu Hugging Face Spaces về triển khai bằng Docker

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Tự học FastAPI và cách phục vụ mô hình* — Chương 6 · đầu ra: Repo thực hành
- 1. Đọc tài liệu chính thức phần Tutorial, làm theo tới mục Request Body
- 2. Hiểu vòng đời ứng dụng: nạp mô hình lúc khởi động, không nạp lại mỗi lần gọi
- 3. Thực hành viết một endpoint nhận JSON và trả JSON
- 4. Đọc về Pydantic để ràng buộc kiểu dữ liệu đầu vào và đầu ra

</details>

**Minh chứng Jira:** 

### [ ] WSEA-4 · Khảo sát và chọn bộ dữ liệu huấn luyện mô hình dự báo
4h · Ưu tiên: Highest · `ai/WSEA-4-...`

- [ ] 1. Tìm các bộ nhật ký ôn tập công khai trên Hugging Face và Kaggle
- [ ] 2. Kiểm tra giấy phép sử dụng của từng bộ
- [ ] 3. Tải về, kiểm tra số lượng bản ghi và các trường dữ liệu
- [ ] 4. Chốt bộ dữ liệu sẽ dùng và ghi nguồn

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Khảo sát và chọn bộ dữ liệu huấn luyện* — Chương 3 · đầu ra: Dataset và ghi chú nguồn
- 1. Tìm bộ nhật ký ôn tập công khai trên Hugging Face và Kaggle
- 2. Kiểm tra giấy phép sử dụng của từng bộ
- 3. Tải về, kiểm tra số bản ghi, số người dùng, các trường có sẵn
- 4. Ghi lại nguồn và điều kiện sử dụng để đưa vào báo cáo

</details>

**Minh chứng Jira:** 


---

## Đợt 2 · D4–D6 — Nền móng và dữ liệu

### [ ] WSEA-17 · Tự học sentence-transformers và pgvector
5h · Ưu tiên: High · `ai/WSEA-17-...`

- [ ] 1. Đọc tài liệu sentence-transformers, hiểu khái niệm embedding
- [ ] 2. Thực hành sinh vector cho một tập câu mẫu
- [ ] 3. Đọc tài liệu pgvector: kiểu dữ liệu vector, toán tử khoảng cách
- [ ] 4. Thực hành tạo bảng vector và truy vấn tìm kiếm gần nhất

**Minh chứng Jira:** 

### [ ] WSEA-18 · Thu thập và chuẩn hoá bộ từ vựng
5h · Ưu tiên: Highest · `ai/WSEA-18-...`

- [ ] 1. Tải danh sách NGSL, lọc lấy 2000 từ phổ biến nhất
- [ ] 2. Bổ sung nghĩa tiếng Việt và câu ví dụ từ nguồn mở
- [ ] 3. Gán bậc CEFR cho từng từ dựa trên thứ hạng phổ biến
- [ ] 4. Kiểm tra và làm sạch dữ liệu, xuất ra tệp CSV

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Thu thập và chuẩn hoá bộ từ vựng* — Chương 7 · đầu ra: Bộ 2000 từ vựng
- 1. Tải danh sách NGSL, lọc 2000 từ phổ biến nhất
- 2. Bổ sung nghĩa, phiên âm, câu ví dụ từ nguồn mở
- 3. Gán bậc CEFR dựa trên thứ hạng phổ biến
- 4. Kiểm tra thủ công 50 từ ngẫu nhiên để xác nhận chất lượng

</details>

**Minh chứng Jira:** 

### [ ] WSEA-19 · Tiền xử lý dữ liệu huấn luyện mô hình dự báo
5h · Ưu tiên: Highest · `ai/WSEA-19-...`

- [ ] 1. Đọc và khám phá cấu trúc bộ dữ liệu đã chọn
- [ ] 2. Làm sạch: loại bản ghi thiếu trường, loại giá trị bất thường
- [ ] 3. Tạo các đặc trưng đầu vào: số ngày trôi qua, số lần ôn, số lần quên
- [ ] 4. Chia tập huấn luyện, tập kiểm tra theo người học

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Khám phá và tiền xử lý dữ liệu huấn luyện* — Chương 3 · đầu ra: Dataset đã xử lý + notebook EDA
- 1. Đọc dữ liệu bằng Pandas, kiểm tra kiểu và giá trị thiếu
- 2. Vẽ phân bố các trường: số ngày cách lần trước, mức đánh giá, số lần ôn
- 3. Loại bản ghi bất thường: thời gian âm, khoảng cách quá lớn, người dùng quá ít bản ghi
- 4. Sắp xếp bản ghi theo thẻ và theo thời gian để tạo chuỗi
- 5. Chia tập huấn luyện và kiểm tra THEO NGƯỜI DÙNG, không chia ngẫu nhiên

</details>

**Minh chứng Jira:** 

### [ ] WSEA-20 · Dựng khung dịch vụ AI
4h · Ưu tiên: High · `ai/WSEA-20-...`

- [ ] 1. Tạo thư mục ai-service với cấu trúc router, models, notebooks
- [ ] 2. Viết ứng dụng FastAPI cơ bản với endpoint kiểm tra sức khoẻ
- [ ] 3. Viết Dockerfile và tệp requirements.txt
- [ ] 4. Chạy thử bằng Docker trên máy cá nhân

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Dựng khung dịch vụ AI* — Chương 6 · đầu ra: Khung dịch vụ chạy được
- 1. Tạo cấu trúc thư mục ai-service theo thiết kế
- 2. Viết ứng dụng FastAPI với endpoint kiểm tra sức khoẻ
- 3. Viết Dockerfile và tệp requirements.txt
- 4. Chạy thử bằng Docker trên máy cá nhân, đo thời gian khởi động

</details>

**Minh chứng Jira:** 


---

## Đợt 3 · D7–D9 — Xác thực và từ vựng

### [ ] WSEA-33 · Cài đặt mô hình dự báo khả năng quên
8h · Ưu tiên: Highest · `ai/WSEA-33-...`

- [ ] 1. Cài đặt hàm tính xác suất ghi nhớ theo độ bền và số ngày trôi qua
- [ ] 2. Cài đặt hàm cập nhật độ khó theo mức đánh giá
- [ ] 3. Cài đặt hàm cập nhật độ bền cho trường hợp nhớ và trường hợp quên
- [ ] 4. Cài đặt hàm tính khoảng cách ôn tập từ độ bền
- [ ] 5. Viết kiểm thử đơn vị cho từng hàm

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Cài đặt mô hình dự báo bằng PyTorch* — Chương 4 · đầu ra: Mã mô hình + unit test
- 1. Cài đặt hàm tính xác suất ghi nhớ theo độ bền và số ngày trôi qua
- 2. Cài đặt hàm khởi tạo độ khó và độ bền cho thẻ mới
- 3. Cài đặt hàm cập nhật độ khó có cơ chế kéo về giá trị trung tâm
- 4. Cài đặt hàm cập nhật độ bền cho trường hợp nhớ được
- 5. Cài đặt hàm cập nhật độ bền cho trường hợp quên
- 6. Cài đặt hàm giới hạn giá trị trong khoảng hợp lệ
- 7. Viết kiểm thử đơn vị cho từng hàm với giá trị biên

</details>

**Minh chứng Jira:** 

### [ ] WSEA-34 · Xây dựng vòng huấn luyện mô hình
6h · Ưu tiên: Highest · `ai/WSEA-34-...`

- [ ] 1. Viết lớp Dataset nạp dữ liệu nhật ký ôn tập theo chuỗi
- [ ] 2. Viết hàm mất mát entropy chéo nhị phân
- [ ] 3. Viết vòng lặp huấn luyện với thuật toán tối ưu
- [ ] 4. Ghi nhật ký quá trình huấn luyện để theo dõi hội tụ

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Xây dựng vòng huấn luyện* — Chương 5 · đầu ra: Vòng huấn luyện
- 1. Viết lớp Dataset trả về chuỗi ôn tập của từng thẻ
- 2. Viết hàm collate xử lý chuỗi có độ dài khác nhau
- 3. Viết hàm mất mát entropy chéo nhị phân trên xác suất dự đoán
- 4. Viết vòng lặp huấn luyện với thuật toán tối ưu và ghi nhật ký
- 5. Thêm cơ chế dừng sớm khi mất mát trên tập kiểm tra không giảm

</details>

**Minh chứng Jira:** 

### [ ] WSEA-35 · Chuẩn bị môi trường huấn luyện trên Kaggle
3h · Ưu tiên: High · `ai/WSEA-35-...`

- [ ] 1. Tạo notebook và tải bộ dữ liệu lên Kaggle
- [ ] 2. Kiểm tra dữ liệu nạp đúng và không lỗi
- [ ] 3. Chạy thử một vòng huấn luyện ngắn
- [ ] 4. Kiểm tra thời gian chạy và điều chỉnh kích thước lô

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Chuẩn bị môi trường huấn luyện trên Kaggle* — Chương 5 · đầu ra: Notebook sẵn sàng
- 1. Tải dataset lên Kaggle dưới dạng Dataset riêng
- 2. Tạo notebook, kiểm tra dữ liệu nạp đúng
- 3. Chạy thử một vòng ngắn để đo thời gian
- 4. Cố định hạt giống ngẫu nhiên để kết quả tái lập được

</details>

**Minh chứng Jira:** 

### [ ] WSEA-36 · MỐC MK-1: rà soát phạm vi và thiết kế
2h · Ưu tiên: Highest · `ai/WSEA-36-...`

- [ ] 1. Kiểm tra tài liệu phạm vi đã được duyệt
- [ ] 2. Kiểm tra lược đồ cơ sở dữ liệu đã chốt và không còn thay đổi
- [ ] 3. Rà soát tiến độ đợt 1 và 2, ghi nhận vướng mắc
- [ ] 4. Điều chỉnh kế hoạch đợt 4 nếu cần

**Minh chứng Jira:** 


---

## Đợt 4 · D10–D12 — Luồng học và huấn luyện

### [ ] WSEA-49 · Huấn luyện và tinh chỉnh mô hình dự báo
7h · Ưu tiên: Highest · `ai/WSEA-49-...`

- [ ] 1. Chạy huấn luyện lần đầu trên Kaggle, theo dõi hội tụ
- [ ] 2. Thử các cấu hình siêu tham số khác nhau
- [ ] 3. Chọn cấu hình cho kết quả tốt nhất trên tập kiểm tra
- [ ] 4. Lưu trọng số mô hình lên Hugging Face Hub kèm mã phiên bản

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Huấn luyện và tinh chỉnh mô hình* — Chương 5 · đầu ra: Trọng số mô hình
- 1. Chạy huấn luyện lần đầu, theo dõi đường cong mất mát
- 2. Thử các tốc độ học khác nhau, chọn giá trị tốt nhất
- 3. Thử các cấu hình khởi tạo tham số khác nhau
- 4. Chọn mô hình tốt nhất trên tập kiểm tra, lưu trọng số
- 5. Tải trọng số lên Hugging Face Hub kèm mã phiên bản

</details>

**Minh chứng Jira:** 

### [ ] WSEA-50 · Cài đặt đường cơ sở và đánh giá mô hình
7h · Ưu tiên: Highest · `ai/WSEA-50-...`

- [ ] 1. Cài đặt thuật toán SM-2 làm đường cơ sở
- [ ] 2. Tính log-loss và RMSE của cả hai trên cùng tập kiểm tra
- [ ] 3. Vẽ biểu đồ độ hiệu chỉnh so sánh dự đoán và thực tế
- [ ] 4. Tổng hợp kết quả vào báo cáo đánh giá mô hình

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Cài đặt đường cơ sở SM-2* — Chương 2 · đầu ra: Mô-đun SM-2
- 1. Đọc đặc tả thuật toán SM-2 gốc
- 2. Cài đặt bằng Python thuần, không dùng thư viện
- 3. Chạy trên cùng tập kiểm tra để lấy số liệu so sánh
- 4. Viết kiểm thử đơn vị đối chiếu với ví dụ trong tài liệu gốc

*Đánh giá chất lượng mô hình* — Chương 5 · đầu ra: Báo cáo đánh giá + biểu đồ
- 1. Tính log-loss trên tập kiểm tra cho cả hai mô hình
- 2. Tính RMSE theo nhóm xác suất dự đoán
- 3. Vẽ biểu đồ độ hiệu chỉnh, chia dự đoán thành mười nhóm
- 4. Tính AUC để đánh giá khả năng phân biệt
- 5. Phân tích các trường hợp dự đoán sai nhiều nhất
- 6. Tổng hợp thành bảng số liệu và biểu đồ cho báo cáo

</details>

**Minh chứng Jira:** 

### [ ] WSEA-51 · Viết chương 1 và 2 báo cáo
4h · Ưu tiên: Medium · `ai/WSEA-51-...`

- [ ] 1. Viết chương 1: tổng quan đề tài và khảo sát hiện trạng
- [ ] 2. Viết chương 2: cơ sở lý thuyết về trí nhớ và học máy
- [ ] 3. Bổ sung nguồn tham khảo
- [ ] 4. Rà soát chính tả và thuật ngữ

**Minh chứng Jira:** 


---

## Đợt 5 · D13–D15 — Triển khai dịch vụ AI

### [ ] WSEA-64 · Xây dựng endpoint dự báo trong dịch vụ AI
6h · Ưu tiên: Highest · `ai/WSEA-64-...`

- [ ] 1. Viết lớp nạp trọng số mô hình khi khởi động ứng dụng
- [ ] 2. Viết endpoint nhận danh sách thẻ và trả về kết quả dự báo
- [ ] 3. Xử lý đầu vào không hợp lệ và giới hạn giá trị đầu ra
- [ ] 4. Viết kiểm thử bằng Pytest cho endpoint

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Xây dựng endpoint dự báo* — Chương 6 · đầu ra: Endpoint hoạt động
- 1. Viết lớp nạp trọng số mô hình khi ứng dụng khởi động
- 2. Viết lược đồ Pydantic cho dữ liệu vào và ra
- 3. Viết endpoint nhận danh sách thẻ, trả kết quả theo lô
- 4. Xử lý đầu vào không hợp lệ và giới hạn giá trị đầu ra
- 5. Viết kiểm thử bằng Pytest cho các trường hợp biên

</details>

**Minh chứng Jira:** 

### [ ] WSEA-65 · Triển khai dịch vụ AI lên Hugging Face Spaces
6h · Ưu tiên: Highest · `ai/WSEA-65-...`

- [ ] 1. Hoàn thiện Dockerfile, tối ưu kích thước image
- [ ] 2. Tạo Space mới với SDK Docker, kết nối kho mã
- [ ] 3. Cấu hình biến môi trường và khoá xác thực nội bộ
- [ ] 4. Chạy thử và đo thời gian khởi động cùng thời gian phản hồi

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Đóng gói và triển khai dịch vụ AI* — Chương 6 · đầu ra: Dịch vụ AI trực tuyến
- 1. Hoàn thiện Dockerfile, dùng ảnh nền nhẹ
- 2. Tối ưu thứ tự lệnh để tận dụng bộ nhớ đệm khi xây dựng
- 3. Tạo Space trên Hugging Face với SDK Docker
- 4. Cấu hình biến môi trường và khoá xác thực nội bộ
- 5. Đo thời gian khởi động và thời gian phản hồi thực tế

</details>

**Minh chứng Jira:** 

### [ ] WSEA-66 · Phối hợp kiểm thử tích hợp dịch vụ AI
4h · Ưu tiên: Highest · `ai/WSEA-66-...`

- [ ] 1. Cùng backend kiểm tra kết nối và định dạng dữ liệu
- [ ] 2. Xử lý các sai lệch về kiểu dữ liệu và múi giờ
- [ ] 3. Kiểm tra kết quả dự báo khớp với chạy cục bộ
- [ ] 4. Ghi tài liệu mô tả các endpoint

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Phối hợp kiểm thử tích hợp* — Chương 6 · đầu ra: Tích hợp thành công
- 1. Cùng backend kiểm tra định dạng dữ liệu hai bên
- 2. Xử lý sai lệch về kiểu dữ liệu và múi giờ
- 3. Đối chiếu kết quả trên môi trường thật với chạy cục bộ
- 4. Viết tài liệu mô tả các endpoint cho backend dùng

</details>

**Minh chứng Jira:** 

### [ ] WSEA-67 · Đệm xử lý sự cố kỹ thuật
2h · Ưu tiên: High · `ai/WSEA-67-...`

- [ ] 1. Xử lý các vấn đề phát sinh khi triển khai mô hình
- [ ] 2. Hỗ trợ các thành viên gặp vướng mắc kỹ thuật

**Minh chứng Jira:** 


---

## Đợt 6 · D16–D18 — Ôn tập theo lịch · v1.0 (MỐC SỐNG CÒN)

### [ ] WSEA-80 · Tối ưu hiệu năng dịch vụ AI
5h · Ưu tiên: High · `ai/WSEA-80-...`

- [ ] 1. Đo thời gian xử lý từng bước trong endpoint dự báo
- [ ] 2. Tối ưu bằng cách xử lý theo lô thay vì từng thẻ
- [ ] 3. Thêm bộ nhớ đệm cho các kết quả tính lặp
- [ ] 4. Đo lại và ghi nhận mức cải thiện

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Tối ưu hiệu năng suy luận* — Chương 6 · đầu ra: Báo cáo tối ưu
- 1. Đo thời gian từng bước trong endpoint bằng công cụ profiling
- 2. Chuyển từ xử lý từng thẻ sang xử lý theo lô
- 3. Thêm bộ nhớ đệm cho các phép tính lặp lại
- 4. Đo lại và ghi nhận mức cải thiện

</details>

**Minh chứng Jira:** 

### [ ] WSEA-81 · MỐC MK-3: xác nhận mô hình hoạt động trên môi trường thật
3h · Ưu tiên: Highest · `ai/WSEA-81-...`

- [ ] 1. Kiểm tra dịch vụ AI phản hồi ổn định
- [ ] 2. Đối chiếu kết quả dự báo trên môi trường thật với chạy cục bộ
- [ ] 3. Kiểm tra phương án dự phòng hoạt động
- [ ] 4. Quyết định có tiếp tục sang chức năng trợ lý hay không

**Minh chứng Jira:** 

### [ ] WSEA-82 · Chuẩn bị dữ liệu cho bộ phân loại ý định
5h · Ưu tiên: High · `ai/WSEA-82-...`

- [ ] 1. Xác định các nhóm ý định: hỏi nghĩa, cách dùng, ngữ pháp, phân biệt từ
- [ ] 2. Viết 200 câu hỏi mẫu đầu tiên và gán nhãn
- [ ] 3. Kiểm tra phân bố nhãn có cân bằng không
- [ ] 4. Ghi tài liệu hướng dẫn gán nhãn cho các câu tiếp theo

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Chuẩn bị dữ liệu phân loại ý định* — Chương 8 · đầu ra: 200 câu mẫu
- 1. Xác định các nhóm ý định câu hỏi của người học
- 2. Viết 200 câu hỏi mẫu đầu tiên, phân bố đều các nhóm
- 3. Gán nhãn và kiểm tra tính nhất quán
- 4. Ghi hướng dẫn gán nhãn để mở rộng về sau

</details>

**Minh chứng Jira:** 

### [ ] WSEA-83 · Chuẩn bị và chia đoạn kho tri thức ngữ pháp
5h · Ưu tiên: High · `ai/WSEA-83-...`

- [ ] 1. Thu thập tài liệu ngữ pháp từ nguồn mở
- [ ] 2. Chia thành các đoạn có ngữ nghĩa trọn vẹn
- [ ] 3. Gán siêu dữ liệu: chủ đề, bậc trình độ, nguồn
- [ ] 4. Kiểm tra chất lượng và loại đoạn trùng lặp

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Biên soạn và chia đoạn kho tri thức ngữ pháp* — Chương 8 · đầu ra: 100 đoạn tri thức
- 1. Thu thập tài liệu ngữ pháp từ nguồn mở, kiểm tra bản quyền
- 2. Chia thành đoạn có ngữ nghĩa trọn vẹn, mỗi đoạn 100 đến 300 từ
- 3. Gán siêu dữ liệu: chủ đề, bậc trình độ, nguồn tham chiếu
- 4. Loại đoạn trùng lặp và đoạn quá ngắn

</details>

**Minh chứng Jira:** 


---

## Đợt 7 · D19–D21 — Trợ lý phần 1

### [ ] WSEA-93 · Sinh vector ngữ nghĩa và nạp vào cơ sở dữ liệu
6h · Ưu tiên: Highest · `ai/WSEA-93-...`

- [ ] 1. Chọn và tải mô hình sinh vector phù hợp tiếng Anh và tiếng Việt
- [ ] 2. Sinh vector cho toàn bộ đoạn tri thức và từ vựng
- [ ] 3. Viết script nạp vector vào bảng pgvector
- [ ] 4. Tạo chỉ mục và kiểm tra tốc độ truy vấn

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Sinh vector ngữ nghĩa cho kho tri thức* — Chương 8 · đầu ra: Vector đã nạp
- 1. Chọn mô hình sinh vector phù hợp, cân nhắc dung lượng và chất lượng
- 2. So sánh vài mô hình trên tập câu hỏi thử
- 3. Sinh vector cho toàn bộ đoạn tri thức và từ vựng
- 4. Viết script nạp vector vào cơ sở dữ liệu
- 5. Tạo chỉ mục và đo tốc độ truy vấn

</details>

**Minh chứng Jira:** 

### [ ] WSEA-94 · Xây dựng chức năng truy hồi ngữ nghĩa
6h · Ưu tiên: Highest · `ai/WSEA-94-...`

- [ ] 1. Viết hàm chuyển câu hỏi thành vector
- [ ] 2. Viết truy vấn tìm k đoạn gần nhất theo khoảng cách cosine
- [ ] 3. Thử nghiệm với các giá trị k khác nhau
- [ ] 4. Đánh giá sơ bộ chất lượng truy hồi trên tập câu hỏi mẫu

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Xây dựng chức năng truy hồi ngữ nghĩa* — Chương 8 · đầu ra: Truy hồi hoạt động
- 1. Viết hàm chuyển câu hỏi thành vector
- 2. Viết truy vấn tìm k đoạn gần nhất theo khoảng cách cosine
- 3. Thử nghiệm với các giá trị k khác nhau
- 4. Xây bộ 30 câu hỏi có đáp án chuẩn để đánh giá
- 5. Đo Recall@k và MRR cho từng cấu hình

</details>

**Minh chứng Jira:** 

### [ ] WSEA-95 · Hoàn thiện gán nhãn dữ liệu phân loại ý định
5h · Ưu tiên: High · `ai/WSEA-95-...`

- [ ] 1. Viết thêm 300 câu hỏi mẫu cho đủ 500 câu
- [ ] 2. Gán nhãn và kiểm tra tính nhất quán
- [ ] 3. Chia tập huấn luyện và tập kiểm tra
- [ ] 4. Xuất dữ liệu ra định dạng phù hợp để huấn luyện

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Hoàn thiện gán nhãn ý định* — Chương 8 · đầu ra: Dataset intent
- 1. Viết thêm 300 câu hỏi cho đủ 500
- 2. Gán nhãn và rà soát lại toàn bộ
- 3. Chia tập huấn luyện và kiểm tra
- 4. Kiểm tra phân bố nhãn có cân bằng không

</details>

**Minh chứng Jira:** 


---

## Đợt 8 · D22–D24 — Trợ lý phần 2

### [ ] WSEA-108 · Huấn luyện bộ phân loại ý định câu hỏi
7h · Ưu tiên: Highest · `ai/WSEA-108-...`

- [ ] 1. Xây dựng đặc trưng đầu vào từ văn bản câu hỏi
- [ ] 2. Huấn luyện mô hình phân loại trên tập đã gán nhãn
- [ ] 3. Đánh giá độ chính xác và ma trận nhầm lẫn
- [ ] 4. Tinh chỉnh và lưu mô hình cuối cùng

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Huấn luyện bộ phân loại ý định* — Chương 8 · đầu ra: Bộ phân loại
- 1. Xây dựng đặc trưng đầu vào từ văn bản
- 2. Huấn luyện mô hình cơ sở bằng scikit-learn để lấy mốc so sánh
- 3. Thử tinh chỉnh mô hình ngôn ngữ nhỏ nếu mô hình cơ sở chưa đủ tốt
- 4. Đánh giá bằng độ chính xác và ma trận nhầm lẫn
- 5. Phân tích các nhóm hay bị nhầm và cải thiện tập dữ liệu

</details>

**Minh chứng Jira:** 

### [ ] WSEA-109 · Tích hợp mô hình xếp hạng lại kết quả truy hồi
6h · Ưu tiên: High · `ai/WSEA-109-...`

- [ ] 1. Tải và tích hợp mô hình cross-encoder
- [ ] 2. Viết bước xếp hạng lại sau khi truy hồi thô
- [ ] 3. So sánh chất lượng truy hồi trước và sau khi xếp hạng lại
- [ ] 4. Tối ưu số lượng đoạn đưa vào bước xếp hạng

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Tích hợp mô hình xếp hạng lại* — Chương 8 · đầu ra: Rerank hoạt động
- 1. Tải mô hình cross-encoder phù hợp
- 2. Viết bước xếp hạng lại sau khi truy hồi thô
- 3. So sánh Recall@k trước và sau khi xếp hạng lại
- 4. Tối ưu số đoạn đưa vào bước xếp hạng, cân bằng chất lượng và tốc độ

</details>

**Minh chứng Jira:** 

### [ ] WSEA-110 · Hoàn thiện pipeline truy hồi trong dịch vụ AI
5h · Ưu tiên: Highest · `ai/WSEA-110-...`

- [ ] 1. Ghép các bước: phân loại ý định, truy hồi, xếp hạng lại
- [ ] 2. Viết endpoint trả về danh sách đoạn tri thức liên quan
- [ ] 3. Xử lý trường hợp không tìm thấy đoạn phù hợp
- [ ] 4. Viết kiểm thử bằng Pytest

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Hoàn thiện pipeline truy hồi* — Chương 8 · đầu ra: Pipeline hoàn chỉnh
- 1. Ghép các bước: phân loại ý định, truy hồi, xếp hạng lại
- 2. Viết endpoint trả về danh sách đoạn tri thức liên quan
- 3. Xử lý trường hợp không tìm thấy đoạn phù hợp
- 4. Viết kiểm thử bằng Pytest

</details>

**Minh chứng Jira:** 


---

## Đợt 9 · D25–D27 — Hoàn thiện trợ lý · v1.1

### [ ] WSEA-123 · Xây dựng khuôn mẫu câu lệnh và tích hợp mô hình sinh
7h · Ưu tiên: Highest · `ai/WSEA-123-...`

- [ ] 1. Viết khuôn mẫu riêng cho từng nhóm ý định
- [ ] 2. Ràng buộc mô hình chỉ trả lời dựa trên ngữ cảnh cung cấp
- [ ] 3. Tích hợp gọi dịch vụ mô hình ngôn ngữ, xử lý phản hồi theo luồng
- [ ] 4. Cài đặt phương án dự phòng khi dịch vụ lỗi

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Xây dựng khuôn mẫu câu lệnh và tích hợp mô hình sinh* — Chương 8 · đầu ra: Sinh câu trả lời
- 1. Viết khuôn mẫu riêng cho từng nhóm ý định
- 2. Ràng buộc mô hình chỉ trả lời dựa trên ngữ cảnh được cung cấp
- 3. Tích hợp gọi dịch vụ mô hình ngôn ngữ, xử lý phản hồi theo luồng
- 4. Cài đặt phương án dự phòng khi dịch vụ lỗi
- 5. Thử nghiệm và tinh chỉnh khuôn mẫu qua nhiều vòng

</details>

**Minh chứng Jira:** 

### [ ] WSEA-124 · Đánh giá chất lượng pipeline truy hồi
6h · Ưu tiên: High · `ai/WSEA-124-...`

- [ ] 1. Chạy bộ 60 câu hỏi qua toàn bộ pipeline
- [ ] 2. Tính chỉ số Recall@k và MRR của bước truy hồi
- [ ] 3. Đánh giá độ trung thực của câu trả lời so với nguồn
- [ ] 4. Tổng hợp số liệu vào báo cáo mô hình

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Đánh giá chất lượng toàn pipeline* — Chương 8 · đầu ra: Báo cáo đánh giá RAG
- 1. Chạy bộ 60 câu hỏi qua toàn bộ pipeline
- 2. Tính Recall@k và MRR của bước truy hồi
- 3. Đánh giá độ trung thực của câu trả lời so với nguồn
- 4. Đo thời gian phản hồi từng bước
- 5. Tổng hợp số liệu vào báo cáo

</details>

**Minh chứng Jira:** 

### [ ] WSEA-125 · Viết chương 4 báo cáo
5h · Ưu tiên: Medium · `ai/WSEA-125-...`

- [ ] 1. Viết phần kiến trúc tổng thể hệ thống
- [ ] 2. Viết phần thiết kế dịch vụ AI và các mô hình
- [ ] 3. Vẽ sơ đồ kiến trúc và luồng xử lý
- [ ] 4. Rà soát và chỉnh sửa

**Minh chứng Jira:** 


---

## Đợt 10 · D28–D30 — Nhận diện qua ảnh · v1.2

### [ ] WSEA-135 · Tích hợp mô hình nhận diện hình ảnh
7h · Ưu tiên: Highest · `ai/WSEA-135-...`

- [ ] 1. Tải và chạy thử mô hình CLIP trên máy cá nhân
- [ ] 2. Viết hàm tiền xử lý ảnh đầu vào
- [ ] 3. Viết hàm phân loại ảnh theo tập nhãn là danh sách từ vựng
- [ ] 4. Kiểm tra kết quả trên tập ảnh mẫu

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Tích hợp mô hình nhận diện hình ảnh* — Chương 7 · đầu ra: Mô hình vision
- 1. Tải và chạy thử mô hình CLIP trên máy cá nhân
- 2. Hiểu cơ chế phân loại không cần huấn luyện lại
- 3. Viết hàm tiền xử lý ảnh đầu vào
- 4. Thử nghiệm các khuôn mẫu câu mô tả nhãn khác nhau
- 5. Kiểm tra kết quả trên tập ảnh mẫu tự chuẩn bị

</details>

**Minh chứng Jira:** 

### [ ] WSEA-136 · Xây dựng ánh xạ nhãn sang từ vựng và tinh chỉnh
6h · Ưu tiên: High · `ai/WSEA-136-...`

- [ ] 1. Xây dựng bảng ánh xạ từ nhãn nhận diện sang từ vựng có bậc CEFR
- [ ] 2. Cài đặt bộ lọc theo trình độ của người học
- [ ] 3. Tinh chỉnh ngưỡng tin cậy để cân bằng độ chính xác và số lượng
- [ ] 4. Đánh giá độ chính xác trên tập ảnh kiểm tra

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Xây dựng ánh xạ nhãn và tinh chỉnh* — Chương 7 · đầu ra: Bảng ánh xạ + đánh giá
- 1. Xây bảng ánh xạ từ nhãn nhận diện sang từ vựng có bậc CEFR
- 2. Cài đặt bộ lọc theo trình độ người học
- 3. Tinh chỉnh ngưỡng tin cậy, cân bằng độ chính xác và số lượng gợi ý
- 4. Chuẩn bị 50 ảnh có nhãn chuẩn để đo độ chính xác
- 5. Đo và ghi nhận kết quả

</details>

**Minh chứng Jira:** 

### [ ] WSEA-137 · MỐC MK-4 và MK-5: xác nhận ba chức năng AI và đóng băng tính năng
4h · Ưu tiên: Highest · `ai/WSEA-137-...`

- [ ] 1. Kiểm tra ba chức năng AI hoạt động ổn định trên môi trường thật
- [ ] 2. Tổng hợp số liệu đánh giá của cả ba mô hình
- [ ] 3. Tuyên bố đóng băng tính năng với cả nhóm
- [ ] 4. Chuyển toàn bộ công việc còn lại sang nhóm sửa lỗi

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Xác nhận ba chức năng AI hoạt động* — Chương 9 · đầu ra: Xác nhận mốc
- 1. Kiểm tra ba endpoint phản hồi ổn định trên môi trường thật
- 2. Đo thời gian phản hồi thực tế của từng chức năng
- 3. Tổng hợp số liệu đánh giá của cả ba mô hình
- 4. Ghi nhận hạn chế còn tồn tại để đưa vào báo cáo

</details>

**Minh chứng Jira:** 


---

## Đợt 11 · D31–D33 — Kiểm thử và khắc phục

### [ ] WSEA-148 · Viết báo cáo xây dựng và đánh giá mô hình AI
8h · Ưu tiên: Highest · `ai/WSEA-148-...`

- [ ] 1. Viết phần mô hình dự báo khả năng quên: kiến trúc, huấn luyện, kết quả
- [ ] 2. Viết phần mô hình nhận diện hình ảnh và đánh giá
- [ ] 3. Viết phần pipeline truy hồi tăng cường và đánh giá
- [ ] 4. Tổng hợp bảng số liệu và biểu đồ

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Viết báo cáo xây dựng và đánh giá mô hình* — Chương 9 · đầu ra: Báo cáo mô hình AI
- 1. Viết phần mô hình dự báo: bài toán, kiến trúc, huấn luyện, kết quả
- 2. Viết phần mô hình thị giác: phương pháp, ánh xạ, đánh giá
- 3. Viết phần pipeline truy hồi: các bước, thiết kế, đánh giá
- 4. Chèn bảng số liệu và biểu đồ, ghi rõ điều kiện thí nghiệm
- 5. Viết phần hạn chế một cách trung thực

</details>

**Minh chứng Jira:** 

### [ ] WSEA-149 · Ghép và rà soát toàn bộ báo cáo
6h · Ưu tiên: Highest · `ai/WSEA-149-...`

- [ ] 1. Thu thập các chương do từng thành viên viết
- [ ] 2. Thống nhất định dạng, cỡ chữ, cách đánh số
- [ ] 3. Rà soát tính nhất quán của thuật ngữ
- [ ] 4. Cập nhật mục lục và danh mục hình bảng

**Minh chứng Jira:** 

### [ ] WSEA-150 · Đệm hỗ trợ khắc phục sự cố
3h · Ưu tiên: High · `ai/WSEA-150-...`

- [ ] 1. Hỗ trợ các thành viên xử lý lỗi phức tạp
- [ ] 2. Xử lý các vấn đề của dịch vụ AI

**Minh chứng Jira:** 


---

## Đợt 12 · D34–D36 — Hoàn thiện và bảo vệ

### [ ] WSEA-160 · Viết chương kết luận và hoàn thiện báo cáo
6h · Ưu tiên: Highest · `ai/WSEA-160-...`

- [ ] 1. Viết phần kết luận và những gì đã đạt được
- [ ] 2. Viết phần hạn chế của đề tài một cách trung thực
- [ ] 3. Viết phần hướng phát triển tương lai
- [ ] 4. Rà soát toàn bộ báo cáo lần cuối và in ấn

**Minh chứng Jira:** 

### [ ] WSEA-161 · Xây dựng bản trình chiếu và chuẩn bị bảo vệ
8h · Ưu tiên: Highest · `ai/WSEA-161-...`

- [ ] 1. Xây dựng slide theo mạch: vấn đề, giải pháp, kiến trúc, kết quả
- [ ] 2. Chọn số liệu và biểu đồ quan trọng nhất để trình bày
- [ ] 3. Chuẩn bị câu trả lời cho các câu hỏi khó dự kiến
- [ ] 4. Tập trình bày và canh thời gian

<details><summary>Chi tiết kỹ thuật (ENG-AI-001)</summary>

*Chuẩn bị trình bày phần AI* — Chương 9 · đầu ra: Slide và Q&A
- 1. Chọn số liệu và biểu đồ quan trọng nhất đưa vào slide
- 2. Chuẩn bị giải thích ngắn gọn cho từng mô hình
- 3. Chuẩn bị câu trả lời cho các câu hỏi kỹ thuật dự kiến
- 4. Chuẩn bị sẵn ảnh mẫu và câu hỏi mẫu cho phần trình diễn

</details>

**Minh chứng Jira:** 

### [ ] WSEA-162 · Tổ chức tổng duyệt và thực hiện bảo vệ
5h · Ưu tiên: Highest · `ai/WSEA-162-...`

- [ ] 1. Tổ chức buổi tổng duyệt với cả nhóm
- [ ] 2. Ghi nhận và khắc phục các vấn đề phát hiện
- [ ] 3. Thực hiện buổi bảo vệ

**Minh chứng Jira:** 


---

## Công việc có trong kế hoạch AI nhưng KHÔNG có task Jira tương ứng

Ba việc dưới đây nằm trong `12_Ke_hoach_cong_viec_AI.xlsx` nhưng không tìm thấy dòng tương ứng
trong sheet Nhập Jira của file 11. Hoặc là tạo task mới trên Jira, hoặc gộp vào task gần nhất — chọn một, đừng để lửng.

- **Đợt 1 — Nghiên cứu bài toán dự báo khả năng quên** (4h, Chương 1, đầu ra: Ghi chú nghiên cứu)
- **Đợt 1 — Thiết kế kiến trúc dịch vụ AI** (4h, Chương 6, đầu ra: Sơ đồ kiến trúc AI)
- **Đợt 11 — Tối ưu và ổn định hoá dịch vụ AI** (5h, Chương 6, đầu ra: Dịch vụ ổn định)

## Đối chiếu đợt giữa hai kế hoạch

- *Biên soạn và chia đoạn kho tri thức ngữ pháp*: kế hoạch AI xếp **đợt 2**, Jira xếp **đợt 6** (WSEA-83).
  Đợt 6 là mốc v1.0, nên để ở đợt 6 là hợp lý hơn — nhưng phải xong trước đợt 7 vì đợt 7 cần đoạn để sinh vector.
- *Cài đặt SM-2* và *Đánh giá chất lượng mô hình* là hai việc riêng trong kế hoạch AI nhưng
  gộp thành một task Jira (WSEA-50). Khi làm nhớ tick đủ cả hai phần.
