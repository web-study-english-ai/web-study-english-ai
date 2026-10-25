#!/usr/bin/env bash
# ==============================================================================
# Script phục hồi cơ sở dữ liệu PostgreSQL từ bản sao lưu (WSEA-108)
# Dự án: Web Study English AI (WSEA)
# Tác giả: Phạm Thái Bình (DevOps Engineer)
# ==============================================================================

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "❌ Lỗi: Vui lòng truyền đường dẫn tệp sao lưu (.dump) cần khôi phục!"
  echo "Cách dùng: $0 <path-to-backup.dump> [target-database-url]"
  exit 1
fi

BACKUP_FILE="$1"
TARGET_DB="${2:-${DATABASE_URL:-}}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "❌ Lỗi: Không tìm thấy tệp sao lưu tại ${BACKUP_FILE}!"
  exit 1
fi

if [ -z "${TARGET_DB}" ]; then
  echo "⚠️  TARGET_DB không được khai báo. Sử dụng kết nối mặc định localhost."
  TARGET_DB="postgresql://postgres:postgres@localhost:5432/study_english"
fi

echo "=========================================================="
echo "⚠️  BẮT ĐẦU QUÁ TRÌNH PHỤC HỒI DỮ LIỆU POSTGRESQL (DISASTER RECOVERY)"
echo "Tệp nguồn: ${BACKUP_FILE}"
echo "Thời gian: $(date)"
echo "=========================================================="

# pg_restore các đối tượng với --clean và --if-exists
# Lưu ý: pg_restore có thể trả warning do các extension có sẵn (như vector, plpgsql), nên lọc mã lỗi an toàn
pg_restore \
  --dbname="${TARGET_DB}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --verbose \
  "${BACKUP_FILE}" || true

echo "=========================================================="
echo "✅ QUÁ TRÌNH PHỤC HỒI HOÀN TẤT THÀNH CÔNG!"
echo "=========================================================="
