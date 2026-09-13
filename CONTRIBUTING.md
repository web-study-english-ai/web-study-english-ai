# Contributing Guidelines

Tài liệu này mô tả quy trình làm việc chung của nhóm khi đóng góp code vào
repo web-study-english-ai. Tất cả thành viên vui lòng đọc trước khi bắt
đầu code.

## Nhánh (Branching)

Repo sử dụng 3 loại nhánh chính:

| Nhánh | Vai trò |
| --- | --- |
| `main` | Nhánh ổn định, chỉ chứa code đã kiểm thử và sẵn sàng triển khai |
| develop | Nhánh tích hợp, là nhánh mặc định; feature mới merge vào đây trước |
| `feature/*`, `fix/*`, `docs/*` | Nhánh làm việc cho từng thay đổi cụ thể |

**Quy tắc đặt tên nhánh làm việc:**

```text
feature/ten-chuc-nang     # thêm tính năng mới
fix/mo-ta-loi             # sửa lỗi
docs/noi-dung             # cập nhật tài liệu
```

Ví dụ:

```text
feature/hoc-tu-moi
fix/loi-dang-nhap
docs/update-readme
```

Nhánh làm việc luôn được tạo từ `develop`, không tạo từ `main`.

## Quy tắc commit message

Commit message cần ngắn gọn và mô tả đúng thay đổi đã thực hiện.

Nhóm sử dụng các tiền tố sau:

- `feat:` — thêm tính năng mới
- `fix:` — sửa lỗi
- `docs:` — thay đổi tài liệu
- `chore:` — cấu hình, dọn dẹp hoặc cập nhật thư viện
- `refactor:` — tái cấu trúc code nhưng không thay đổi hành vi

Ví dụ:

```text
feat: thêm chức năng tra cứu từ vựng theo chủ đề
fix: sửa lỗi đăng nhập
docs: cập nhật hướng dẫn cài đặt
```

Commit message có thể sử dụng tiếng Việt hoặc tiếng Anh, nhưng nên thống nhất
cách sử dụng trong toàn bộ dự án.

## Quy trình Pull Request

1. Tạo nhánh mới từ `develop` theo đúng quy tắc đặt tên ở trên.
2. Code và commit theo từng phần việc nhỏ, dễ theo dõi.
3. Push nhánh lên GitHub và tạo Pull Request nhắm vào `develop`.
4. Điền mô tả PR, bao gồm:
   - Đã thay đổi những gì.
   - Lý do thực hiện thay đổi.
   - Những phần nào của hệ thống có thể bị ảnh hưởng.
5. Chờ thành viên trong nhóm review Pull Request.
6. Trong giai đoạn thiết lập ban đầu, nếu chưa đủ thành viên để review, người
   tạo PR có thể tự merge sau khi đã tự kiểm tra đầy đủ.
7. Sau khi merge, xoá nhánh đã sử dụng để giữ repository gọn gàng.

## Quy tắc chung

- **Không push trực tiếp vào main hoặc develop**; mọi thay đổi phải
  được thực hiện thông qua Pull Request.
- Mỗi Pull Request nên tập trung vào **một thay đổi cụ thể**, tránh gộp nhiều
  công việc không liên quan vào cùng một PR.
- Trước khi tạo Pull Request, cần đảm bảo code chạy được cục bộ và không còn
  các lỗi cú pháp rõ ràng.
- Khi GitHub Actions được thiết lập hoàn chỉnh, Pull Request cần vượt qua các
  kiểm tra tự động trước khi merge.
- Nếu thay đổi có thể ảnh hưởng tới phần việc của thành viên khác, cần trao đổi
  với nhóm trước khi merge.
- Không commit các thông tin nhạy cảm như API key, mật khẩu, secret hoặc chuỗi
  kết nối chứa thông tin bảo mật vào repository.

## Câu hỏi

Nếu có vướng mắc về quy trình Git/GitHub, liên hệ DevOps hoặc trao đổi trực
tiếp trong nhóm.
