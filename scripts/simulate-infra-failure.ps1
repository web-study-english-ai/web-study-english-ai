# ==============================================================================
# Script: simulate-infra-failure.ps1
# Task: WSEA-139 - Đệm xử lý sự cố hạ tầng (Infrastructure Resilience & Fault Tolerance)
# ==============================================================================

param(
    [string]$BaseUrl = "http://localhost:3000/api",
    [switch]$Production
)

if ($Production) {
    $BaseUrl = "https://web-study-english-ai-prod.onrender.com/api"
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   WSEA-139: DIEN TAP & KIEM TRA DEM XU LY SU CO HA TANG        " -ForegroundColor Yellow
Write-Host "   Endpoint muc tieu: $BaseUrl" -ForegroundColor Gray
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Kiem tra trang thai ban dau
Write-Host "`n[1/4] Kiem tra trang thai Bo dem ha tang ban dau (Telemetry)..." -ForegroundColor Cyan
try {
    $statusUri = "$BaseUrl/infra-resilience/status"
    $status = Invoke-RestMethod -Uri $statusUri -Method Get -TimeoutSec 10

    $circuitColor = if ($status.circuitState -eq "CLOSED") { "Green" } elseif ($status.circuitState -eq "HALF_OPEN") { "Yellow" } else { "Red" }
    Write-Host "  -> Circuit Breaker State: $($status.circuitState)" -ForegroundColor $circuitColor
    Write-Host "  -> Tong so cuoc goi:      $($status.totalCalls)" -ForegroundColor White
    Write-Host "  -> Thanh cong:            $($status.successfulCalls)" -ForegroundColor Green
    Write-Host "  -> That bai:              $($status.failedCalls)" -ForegroundColor Red
    Write-Host "  -> Phuc hoi qua Retry:    $($status.recoveredByRetry)" -ForegroundColor Cyan
    Write-Host "  -> Chuyen sang Fallback:  $($status.fallbackCalls)" -ForegroundColor Yellow
    Write-Host "  -> Concurrency dang chay: $($status.activeConcurrentCalls)" -ForegroundColor White
} catch {
    Write-Host "  [!] Khong the ket noi toi $statusUri : $_" -ForegroundColor Red
}

# 2. Thu nghiem Warm-up Ping
Write-Host "`n[2/4] Thu nghiem co che lam am mo hinh (Warm-up Buffer)..." -ForegroundColor Cyan
try {
    $warmupUri = "$BaseUrl/infra-resilience/warmup"
    $warmup = Invoke-RestMethod -Uri $warmupUri -Method Post -TimeoutSec 15

    $statusColor = if ($warmup.status -eq "UP") { "Green" } elseif ($warmup.status -eq "DEGRADED") { "Yellow" } else { "Red" }
    Write-Host "  -> AI Space Status:   $($warmup.status)" -ForegroundColor $statusColor
    Write-Host "  -> Do tre phan hoi:   $($warmup.latencyMs) ms" -ForegroundColor White
    Write-Host "  -> Thong diep:        $($warmup.message)" -ForegroundColor White
} catch {
    Write-Host "  [!] Khong the thuc hien warmup tai $warmupUri : $_" -ForegroundColor Red
}

# 3. Dien tap kich ban su co: Ngat cuong buc Circuit Breaker (OPEN)
Write-Host "`n[3/4] Dien tap kich ban su co ha tang: Kich hoat ngat Circuit Breaker..." -ForegroundColor Cyan
try {
    $tripUri = "$BaseUrl/infra-resilience/circuit-breaker/trip"
    $tripBody = @{ reason = "Dien tap su co ha tang theo WSEA-139" } | ConvertTo-Json
    $tripResp = Invoke-RestMethod -Uri $tripUri -Method Post -Body $tripBody -ContentType "application/json" -TimeoutSec 10

    Write-Host "  -> Ket qua ngat:      $($tripResp.message)" -ForegroundColor Red
    Write-Host "  -> Trang thai moi:    $($tripResp.circuitState)" -ForegroundColor Red
    Write-Host "  -> (Kiem chung): Khi Circuit OPEN, tat ca cuoc goi AI se fallback ve offline 0ms!" -ForegroundColor Yellow
} catch {
    Write-Host "  [!] Khong the ngat Circuit tai $tripUri : $_" -ForegroundColor Red
}

# 4. Khoi phuc Circuit Breaker (CLOSED)
Write-Host "`n[4/4] Khoi phuc he thong sau su co: Reset Circuit Breaker ve CLOSED..." -ForegroundColor Cyan
try {
    $resetUri = "$BaseUrl/infra-resilience/circuit-breaker/reset"
    $resetResp = Invoke-RestMethod -Uri $resetUri -Method Post -TimeoutSec 10

    Write-Host "  -> Ket qua reset:     $($resetResp.message)" -ForegroundColor Green
    Write-Host "  -> Trang thai moi:    $($resetResp.circuitState)" -ForegroundColor Green
} catch {
    Write-Host "  [!] Khong the khoi phuc tai $resetUri : $_" -ForegroundColor Red
}

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "   HOAN TAT DIEN TAP & KIEM TRA WSEA-139                       " -ForegroundColor Yellow
Write-Host "=================================================================" -ForegroundColor Cyan
