# ==============================================================================
# Script khôi phục cơ sở dữ liệu PostgreSQL cho Windows / Docker Local (WSEA-108)
# Dự án: Web Study English AI (WSEA)
# Tác giả: Phạm Thái Bình (DevOps Engineer)
# ==============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile,
    [string]$TargetDb = "study_english",
    [string]$DbUrl = $env:DATABASE_URL
)

if (-not (Test-Path $BackupFile)) {
    Write-Error "[Error] Khong tim thay tep sao luu tai $BackupFile"
    exit 1
}

$fullBackupPath = (Resolve-Path $BackupFile).Path
$filename = Split-Path $fullBackupPath -Leaf

Write-Host "==========================================================" -ForegroundColor Red
Write-Host "[START] BAT DAU QUA TRINH PHUC HOI DU LIEU POSTGRESQL (DISASTER RECOVERY)" -ForegroundColor Red
Write-Host "Tep nguon: $fullBackupPath"
Write-Host "Thoi gian: $(Get-Date)"
Write-Host "=========================================================="

$hasPgRestore = Get-Command "pg_restore" -ErrorAction SilentlyContinue

if ($hasPgRestore -and $DbUrl) {
    Write-Host "Sử dụng pg_restore hệ thống..." -ForegroundColor Green
    & pg_restore --dbname=$DbUrl --clean --if-exists --no-owner --no-privileges --verbose $fullBackupPath
} else {
    Write-Host "Sử dụng Docker container 'wsea-postgres' để khôi phục..." -ForegroundColor Yellow
    # Đảm bảo container đang chạy
    $containerRunning = docker ps --filter "name=wsea-postgres" --format "{{.Names}}"
    if (-not $containerRunning) {
        docker compose up -d postgres
        Start-Sleep -Seconds 3
    }

    # Copy file vao container
    docker cp $fullBackupPath "wsea-postgres:/tmp/$filename"

    # Thuc hien restore (cho phep ma canh bao extension)
    docker exec -t wsea-postgres pg_restore -U postgres -d $TargetDb --clean --if-exists --no-owner --no-privileges "/tmp/$filename"
    docker exec wsea-postgres rm -f "/tmp/$filename"
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "[OK] QUA TRINH PHUC HOI DU LIEU HOAN TAT THANH CONG!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
