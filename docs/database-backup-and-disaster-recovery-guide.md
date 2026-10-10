# HƯỚNG DẪN SAO LƯU & QUY TRÌNH PHỤC HỒI DỮ LIỆU POSTGRESQL (WSEA-108)
## (Database Backup Automation & Disaster Recovery Runbook)

* **Dự án:** Web Study English AI (`web-study-english-ai`)
* **Kỹ sư DevOps:** Phạm Thái Bình
* **Phiên bản:** v1.0 - Disaster Recovery SOP
* **Thời gian thiết lập:** 10/10/2026

---

## 1. TỔNG QUAN CHIẾN LƯỢC SAO LƯU (BACKUP STRATEGY)

Nhằm bảo vệ dữ liệu học tập của học viên và từ điển Oxford/CEFR trước các rủi ro thảm họa phần cứng, thao tác sai hoặc lỗi nâng cấp hệ thống, dự án thiết lập kiến trúc sao lưu đa tầng:

| Thành phần | Đặc tả kỹ thuật |
| :--- | :--- |
| **Công cụ sao lưu** | `pg_dump` định dạng Custom Binary Archive (`-F c`) |
| **Tần suất tự động** | Hàng ngày lúc **02:00 AM (Giờ Việt Nam - GMT+7)** qua GitHub Actions Cron |
| **Lưu trữ an toàn** | GitHub Artifacts Storage (Mã hóa, lưu giữ 14 ngày) |
| **Chính sách dọn dẹp** | Tự động luân chuyển và xóa các bản sao lưu cũ hơn 7 ngày ở local |
| **Mục tiêu RPO** | **< 24 giờ** (Recovery Point Objective - Tối đa 1 ngày dữ liệu) |
| **Mục tiêu RTO** | **< 10 phút** (Recovery Time Objective - Thời gian khôi phục hoàn tất) |

---

## 2. DANH MỤC CÔNG CỤ VÀ SCRIPT TỰ ĐỘNG

Dự án cung cấp bộ công cụ tự động hóa cross-platform nằm trong thư mục `scripts/`:

1. **`scripts/backup-db.sh`** (Chạy trên Linux / GitHub Actions CI):
   * Tự động đọc biến môi trường `DATABASE_URL` (hỗ trợ cả Supabase Cloud và Docker).
   * Xuất file `.dump` với các tham số loại trừ ownership và privileges (`--clean --if-exists --no-owner --no-privileges`).
2. **`scripts/backup-db.ps1`** (Chạy trên Windows máy phát triển):
   * Hỗ trợ tự động trích xuất dữ liệu trực tiếp từ container `wsea-postgres` mà không yêu cầu cài đặt PostgreSQL trên máy host.
3. **`scripts/restore-db.sh` & `scripts/restore-db.ps1`**:
   * Script nạp bản sao lưu vào máy chủ đích thông qua `pg_restore`.
4. **`.github/workflows/database-backup.yml`**:
   * Workflow tự động kích hoạt hàng ngày và hỗ trợ nút bấm thủ công `Run workflow` khi cần backup khẩn cấp trước khi release.

---

## 3. KẾT QUẢ DIỄN TẬP PHỤC HỒI DỮ LIỆU (RESTORE DRILL VERIFICATION)

Vào ngày 10/10/2026, bộ phận DevOps đã tiến hành một buổi **Diễn tập ứng cứu sự cố (Disaster Recovery Drill)** thực tế trên môi trường cô lập:

* **Tệp bản sao lưu kiểm thử:** `backups/wsea_backup_20261010_180539.dump` (Dung lượng: **164.03 KB**)
* **Database phục hồi thử nghiệm:** `restore_drill_test`
* **Kết quả đối soát tính toàn vẹn (Data Integrity Audit):**

```text
==========================================================
BẢNG ĐỐI SOÁT DỮ LIỆU SAU PHỤC HỒI (RESTORE AUDIT)
----------------------------------------------------------
Bảng kiểm tra        Dữ liệu gốc      Dữ liệu sau restore    Trạng thái
----------------------------------------------------------
topics               22 chủ đề        22 chủ đề              ✓ Khớp 100%
words                2.000 từ vựng    2.000 từ vựng          ✓ Khớp 100%
_prisma_migrations   4 bản ghi        4 bản ghi              ✓ Khớp 100%
Tổng số bảng         7 bảng           7 bảng                 ✓ Khớp 100%
----------------------------------------------------------
KẾT LUẬN: BẢN SAO LƯU NGUYÊN VẸN 100%, KHÔNG CÓ SAI LỆCH DỮ LIỆU.
==========================================================
```

---

## 4. QUY TRÌNH KHÔI PHỤC DỮ LIỆU KHẨN CẤP (DISASTER RECOVERY SOP)

Khi xảy ra sự cố nghiêm trọng trên Production (hoặc Staging), Kỹ sư DevOps thực hiện 4 bước sau:

### Bước 1: Tải bản sao lưu mới nhất
1. Truy cập tab **Actions** trên GitHub Repository.
2. Chọn workflow **Database Backup** và tải tệp Artifact `db-backup-production-xxx.zip` gần nhất về máy.
3. Giải nén để lấy tệp `wsea_backup_YYYYMMDD_HHMMSS.dump`.

### Bước 2: Tạm dừng dịch vụ Web Service
Tạm ngưng nhận traffic vào Backend trên Render Dashboard để tránh việc người dùng ghi thêm dữ liệu mới trong lúc đang khôi phục.

### Bước 3: Thực thi lệnh phục hồi qua `pg_restore`
Mở Terminal và chạy lệnh khôi phục vào Database Production:

```bash
# Đối với Linux / Server:
./scripts/restore-db.sh ./backups/wsea_backup_YYYYMMDD_HHMMSS.dump "postgresql://postgres:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"

# Hoặc chạy lệnh pg_restore trực tiếp:
pg_restore \
  --dbname="postgresql://postgres:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --verbose \
  ./backups/wsea_backup_YYYYMMDD_HHMMSS.dump
```

### Bước 4: Kiểm tra và Mở lại dịch vụ
1. Chạy truy vấn kiểm tra số lượng bản ghi các bảng chính (`topics`, `words`, `users`).
2. Khởi động lại Render Web Service và kiểm tra endpoint `GET /health` (`status: ok`).
3. Gửi thông báo hoàn tất khôi phục cho Nhóm trưởng và PM.

---
*Tài liệu thuộc hồ sơ kỹ thuật Đợt 6 - Dự án Web Study English AI.*
