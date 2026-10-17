#!/usr/bin/env bash
# ==============================================================================
# Script sao lưu cơ sở dữ liệu PostgreSQL tự động (WSEA-108)
# Dự án: Web Study English AI (WSEA)
# Tác giả: Phạm Thái Bình (DevOps Engineer)
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="wsea_backup_${TIMESTAMP}.dump"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

mkdir -p "${BACKUP_DIR}"

# Xác định chuỗi kết nối
if [ -z "${DATABASE_URL:-}" ]; then
  echo "⚠️  DATABASE_URL không được khai báo. Sử dụng kết nối mặc định localhost."
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/study_english"
fi

echo "=========================================================="
echo "🚀 BẮT ĐẦU QUÁ TRÌNH SAO LƯU POSTGRESQL (WSEA-108)"
echo "Thời gian: $(date)"
echo "Tệp đích:  ${BACKUP_PATH}"
echo "=========================================================="

# Thực hiện pg_dump với định dạng Custom (-F c), bỏ qua quyền owner và role Supabase
pg_dump "${DATABASE_URL}" \
  --format=c \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --file="${BACKUP_PATH}"

FILE_SIZE=$(du -h "${BACKUP_PATH}" | cut -f1)
echo "✅ Sao lưu thành công! Dung lượng tệp: ${FILE_SIZE}"

# Dọn dẹp các bản sao lưu cũ hơn RETENTION_DAYS
echo "🧹 Đang kiểm tra và dọn dẹp các bản sao lưu cũ hơn ${RETENTION_DAYS} ngày..."
find "${BACKUP_DIR}" -type f -name "wsea_backup_*.dump" -mtime +"${RETENTION_DAYS}" -exec rm -f {} +
echo "✅ Hoàn tất dọn dẹp định kỳ."
echo "=========================================================="
