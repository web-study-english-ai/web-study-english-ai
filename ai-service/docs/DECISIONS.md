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
