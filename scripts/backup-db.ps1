# ==============================================================================
# Script sao lưu cơ sở dữ liệu PostgreSQL cho môi trường Windows/Local (WSEA-108)
# Dự án: Web Study English AI (WSEA)
# Tác giả: Phạm Thái Bình (DevOps Engineer)
# ==============================================================================

param(
    [string]$BackupDir = ".\backups",
    [int]$RetentionDays = 7,
    [string]$DbUrl = $env:DATABASE_URL
)

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFilename = "wsea_backup_$timestamp.dump"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$backupPath = Join-Path $BackupDir $backupFilename

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🚀 BẮT ĐẦU QUÁ TRÌNH SAO LƯU POSTGRESQL (WSEA-108)" -ForegroundColor Cyan
Write-Host "Thời gian: $(Get-Date)"
Write-Host "Tệp đích:  $backupPath"
Write-Host "=========================================================="

# Kiểm tra xem có pg_dump trên máy không, nếu không thì dùng Docker container
$hasPgDump = Get-Command "pg_dump" -ErrorAction SilentlyContinue

if ($hasPgDump -and $DbUrl) {
    Write-Host "Sử dụng pg_dump hệ thống..." -ForegroundColor Green
    & pg_dump $DbUrl --format=c --clean --if-exists --no-owner --no-privileges --file=$backupPath
} else {
    Write-Host "Sử dụng Docker container 'wsea-postgres' để xuất bản sao lưu..." -ForegroundColor Yellow
    # Kiểm tra container có đang chạy không
    $containerRunning = docker ps --filter "name=wsea-postgres" --format "{{.Names}}"
    if (-not $containerRunning) {
        Write-Host "Container wsea-postgres chưa bật. Đang khởi động qua Docker Compose..." -ForegroundColor Yellow
        docker compose up -d postgres
        Start-Sleep -Seconds 3
    }
    
    # Thực hiện dump qua docker exec
    docker exec -t wsea-postgres pg_dump -U postgres -d study_english --format=c --clean --if-exists --no-owner --no-privileges -f "/tmp/$backupFilename"
    docker cp "wsea-postgres:/tmp/$backupFilename" $backupPath
    docker exec wsea-postgres rm -f "/tmp/$backupFilename"
}

if (Test-Path $backupPath) {
    $fileSize = (Get-Item $backupPath).Length
    $fileSizeKB = [math]::Round($fileSize / 1KB, 2)
    Write-Host "✅ Sao lưu thành công! Dung lượng tệp: $fileSizeKB KB ($backupPath)" -ForegroundColor Green
} else {
    Write-Error "❌ Sao lưu thất bại! Không tìm thấy tệp đầu ra."
    exit 1
}

# Dọn dẹp tệp cũ
$cutoffDate = (Get-Date).AddDays(-$RetentionDays)
$oldFiles = Get-ChildItem -Path $BackupDir -Filter "wsea_backup_*.dump" | Where-Object { $_.LastWriteTime -lt $cutoffDate }
foreach ($file in $oldFiles) {
    Write-Host "🧹 Đang dọn dẹp bản sao lưu cũ: $($file.Name)" -ForegroundColor Gray
    Remove-Item -Path $file.FullName -Force
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "✅ Hoàn tất toàn bộ quy trình sao lưu!" -ForegroundColor Cyan
