# ==============================================================================
# Script: check-ai-resources.ps1
# Task: WSEA-138 - Giám sát chi phí, token và tài nguyên hệ thống AI
# ==============================================================================

param(
    [string]$BaseUrl = "https://web-study-english-ai-prod.onrender.com/api",
    [switch]$Local
)

if ($Local) {
    $BaseUrl = "http://localhost:3000/api"
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   WSEA-138: KIEM TRA CHI PHI VA TAI NGUYEN AI SERVICE          " -ForegroundColor Yellow
Write-Host "   Endpoint muc tieu: $BaseUrl" -ForegroundColor Gray
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Kiem tra tai nguyen he thong & AI Service Health
Write-Host "`n[1/2] Dang kiem tra tai nguyen he thong & ket noi AI Service..." -ForegroundColor Cyan
try {
    $resourceUri = "$BaseUrl/ai-monitor/resources"
    $resResp = Invoke-RestMethod -Uri $resourceUri -Method Get -TimeoutSec 10

    Write-Host "  -> Memory RSS:        $($resResp.memoryRssMb) MB" -ForegroundColor White
    Write-Host "  -> Heap Used / Total: $($resResp.heapUsedMb) MB / $($resResp.heapTotalMb) MB" -ForegroundColor White
    Write-Host "  -> Process Uptime:    $($resResp.uptimeSeconds) giay" -ForegroundColor White

    $aiHealth = $resResp.aiServiceHealth
    $statusColor = if ($aiHealth.status -eq "UP") { "Green" } elseif ($aiHealth.status -eq "DEGRADED") { "Yellow" } else { "Red" }
    Write-Host "  -> AI Service Status: $($aiHealth.status)" -ForegroundColor $statusColor
    Write-Host "  -> AI Ping Latency:   $($aiHealth.latencyMs) ms" -ForegroundColor White
    Write-Host "  -> AI Endpoint:       $($aiHealth.endpoint)" -ForegroundColor Gray
} catch {
    Write-Host "  [!] Khong the lay thong tin tai nguyen tu $resourceUri : $_" -ForegroundColor Red
}

# 2. Kiem tra doi soat chi phi, token & Circuit Breaker
Write-Host "`n[2/2] Dang lay bao cao doi soat chi phi & nguong ngan sach..." -ForegroundColor Cyan
try {
    $summaryUri = "$BaseUrl/ai-monitor/summary"
    $sumResp = Invoke-RestMethod -Uri $summaryUri -Method Get -TimeoutSec 10

    Write-Host "  -> Tong so cuoc goi:  $($sumResp.totalCalls) (Thanh cong: $($sumResp.successCalls), That bai: $($sumResp.failedCalls))" -ForegroundColor White
    Write-Host "  -> Ti le thanh cong:  $($sumResp.successRate)%" -ForegroundColor Green
    Write-Host "  -> Do tre trung binh: $($sumResp.avgLatencyMs) ms" -ForegroundColor White
    Write-Host "  -> Prompt Tokens:     $($sumResp.tokens.promptTokens)" -ForegroundColor Gray
    Write-Host "  -> Completion Tokens: $($sumResp.tokens.completionTokens)" -ForegroundColor Gray
    Write-Host "  -> Tong Tokens:       $($sumResp.tokens.totalTokens)" -ForegroundColor Gray

    $costs = $sumResp.costs
    Write-Host "`n--- CHI PHI & NGAN SACH DO AN (Budget Limit: $($costs.budgetLimitVnd.ToString('N0')) VND) ---" -ForegroundColor Yellow
    Write-Host "  -> Chi phi uoc tinh (USD): `$$($costs.totalCostUsd.ToString('F4')) USD" -ForegroundColor White
    Write-Host "  -> Chi phi quy doi (VND):  $($costs.totalCostVnd.ToString('N0')) VND" -ForegroundColor White
    Write-Host "  -> Ngan sach con lai:      $($costs.budgetRemainingVnd.ToString('N0')) VND" -ForegroundColor Green
    Write-Host "  -> Phan tram tieu hao:     $($costs.consumedPercentage)%" -ForegroundColor Cyan

    $threshColor = if ($costs.thresholdStatus -eq "NORMAL") { "Green" } elseif ($costs.thresholdStatus -eq "WARNING_70") { "Yellow" } else { "Red" }
    Write-Host "  -> Trang thai canh bao:    $($costs.thresholdStatus)" -ForegroundColor $threshColor
    Write-Host "  -> Thong diep:             $($costs.thresholdMessage)" -ForegroundColor $threshColor
    Write-Host "  -> Circuit Breaker:        $(if ($costs.circuitBreakerOpen) { 'OPEN (DANG NGAT GỌI NGOÀI)' } else { 'CLOSED (HOAT DONG BINH THUONG)' })" -ForegroundColor $(if ($costs.circuitBreakerOpen) { 'Red' } else { 'Green' })

} catch {
    Write-Host "  [!] Khong the lay bao cao chi phi tu $summaryUri : $_" -ForegroundColor Red
}

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "   HOAN TAT KIEM TRA WSEA-138" -ForegroundColor Yellow
Write-Host "=================================================================" -ForegroundColor Cyan
