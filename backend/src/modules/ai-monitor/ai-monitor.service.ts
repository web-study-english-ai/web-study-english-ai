import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { RecordCallDto, AiServiceType } from './dto/record-call.dto';

export enum BudgetThresholdStatus {
  NORMAL = 'NORMAL',
  WARNING_70 = 'WARNING_70',
  HIGH_ALERT_85 = 'HIGH_ALERT_85',
  CIRCUIT_BREAKER_TRIGGERED = 'CIRCUIT_BREAKER_TRIGGERED',
}

export interface ServiceMetric {
  calls: number;
  success: number;
  failed: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalCostUsd: number;
}

export interface AiMonitorSummary {
  timestamp: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  successRate: number;
  avgLatencyMs: number;
  tokens: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costs: {
    totalCostUsd: number;
    totalCostVnd: number;
    budgetLimitVnd: number;
    budgetRemainingVnd: number;
    consumedPercentage: number;
    exchangeRateVnd: number;
    thresholdStatus: BudgetThresholdStatus;
    thresholdMessage: string;
    circuitBreakerOpen: boolean;
  };
  services: Record<AiServiceType, ServiceMetric>;
  resources: {
    memoryRssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    uptimeSeconds: number;
    aiServiceHealth: {
      status: 'UP' | 'DOWN' | 'DEGRADED';
      latencyMs: number | null;
      endpoint: string;
      models: string[];
    };
  };
}

@Injectable()
export class AiMonitorService implements OnModuleInit {
  private readonly logger = new Logger(AiMonitorService.name);

  // Bảng giá quy chuẩn (Pricing Matrix)
  private readonly PROMPT_PRICE_PER_M_USD = 0.15; // $0.15 / 1M prompt tokens (Chuẩn GPT-4o-mini / embedding)
  private readonly COMPLETION_PRICE_PER_M_USD = 0.6; // $0.60 / 1M completion tokens
  private readonly EXCHANGE_RATE_VND = 25_000;
  private readonly BUDGET_LIMIT_VND = 500_000; // 500.000 VNĐ (~$20 USD) theo ngân sách đồ án

  // Thống kê bộ đếm
  private totalCalls = 0;
  private successCalls = 0;
  private failedCalls = 0;
  private totalLatencyMs = 0;

  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;

  private manualCircuitBreaker = false;

  private readonly serviceMetrics: Record<AiServiceType, ServiceMetric> = {
    FSRS_RETENTION: this.createEmptyMetric(),
    LLM_ASSISTANT_RAG: this.createEmptyMetric(),
    VISION_CLIP: this.createEmptyMetric(),
    HEALTH_PING: this.createEmptyMetric(),
  };

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.logger.log(
      '🚀 Khởi tạo AiMonitorService: Giám sát chi phí, token và tài nguyên AI Service',
    );
  }

  private createEmptyMetric(): ServiceMetric {
    return {
      calls: 0,
      success: 0,
      failed: 0,
      totalLatencyMs: 0,
      avgLatencyMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalCostUsd: 0,
    };
  }

  /**
   * Ghi nhận một lần gọi tới AI Service / LLM
   */
  recordCall(dto: RecordCallDto): void {
    this.totalCalls++;
    if (dto.success) {
      this.successCalls++;
    } else {
      this.failedCalls++;
    }
    this.totalLatencyMs += dto.latencyMs;

    this.totalPromptTokens += dto.promptTokens;
    this.totalCompletionTokens += dto.completionTokens;

    // Cập nhật thống kê phân hệ
    const svc = this.serviceMetrics[dto.serviceType];
    svc.calls++;
    if (dto.success) {
      svc.success++;
    } else {
      svc.failed++;
    }
    svc.totalLatencyMs += dto.latencyMs;
    svc.avgLatencyMs = Math.round(svc.totalLatencyMs / svc.calls);
    svc.promptTokens += dto.promptTokens;
    svc.completionTokens += dto.completionTokens;

    // Tính chi phí phát sinh
    const callCostUsd =
      (dto.promptTokens / 1_000_000) * this.PROMPT_PRICE_PER_M_USD +
      (dto.completionTokens / 1_000_000) * this.COMPLETION_PRICE_PER_M_USD;
    svc.totalCostUsd += callCostUsd;

    // Kiểm tra ngưỡng ngân sách sau khi ghi nhận
    this.checkAndTriggerBudgetAlerts();
  }

  /**
   * Tính toán tổng chi phí hiện tại (USD & VND)
   */
  calculateTotalCost() {
    const promptCost = (this.totalPromptTokens / 1_000_000) * this.PROMPT_PRICE_PER_M_USD;
    const completionCost =
      (this.totalCompletionTokens / 1_000_000) * this.COMPLETION_PRICE_PER_M_USD;
    const totalCostUsd = promptCost + completionCost;
    const totalCostVnd = Math.round(totalCostUsd * this.EXCHANGE_RATE_VND);
    const budgetRemainingVnd = Math.max(this.BUDGET_LIMIT_VND - totalCostVnd, 0);
    const consumedPercentage = Math.round((totalCostVnd / this.BUDGET_LIMIT_VND) * 10000) / 100;

    let thresholdStatus = BudgetThresholdStatus.NORMAL;
    let thresholdMessage = 'Chi phí trong tầm kiểm soát an toàn (< 70% ngân sách)';

    if (consumedPercentage >= 100 || this.manualCircuitBreaker) {
      thresholdStatus = BudgetThresholdStatus.CIRCUIT_BREAKER_TRIGGERED;
      thresholdMessage =
        '🚨 ĐÃ VƯỢT HẠN MỨC NGÂN SÁCH (100%): Kích hoạt Circuit Breaker chuyển chế độ dự phòng';
    } else if (consumedPercentage >= 85) {
      thresholdStatus = BudgetThresholdStatus.HIGH_ALERT_85;
      thresholdMessage =
        '🟠 CẢNH BÁO MỨC CAO: Đã tiêu hao từ 85% ngân sách đồ án, áp dụng bộ đệm thắt chặt';
    } else if (consumedPercentage >= 70) {
      thresholdStatus = BudgetThresholdStatus.WARNING_70;
      thresholdMessage = '🟡 CẢNH BÁO TIÊU HAO: Đã đạt ngưỡng 70% ngân sách đồ án (350.000 VNĐ)';
    }

    const circuitBreakerOpen = thresholdStatus === BudgetThresholdStatus.CIRCUIT_BREAKER_TRIGGERED;

    return {
      totalCostUsd,
      totalCostVnd,
      budgetLimitVnd: this.BUDGET_LIMIT_VND,
      budgetRemainingVnd,
      consumedPercentage,
      exchangeRateVnd: this.EXCHANGE_RATE_VND,
      thresholdStatus,
      thresholdMessage,
      circuitBreakerOpen,
    };
  }

  /**
   * Kiểm tra và phát cảnh báo qua Sentry / Logger khi tiêu hao vượt ngưỡng
   */
  private checkAndTriggerBudgetAlerts(): void {
    const cost = this.calculateTotalCost();

    if (cost.thresholdStatus === BudgetThresholdStatus.CIRCUIT_BREAKER_TRIGGERED) {
      this.logger.error(
        `[WSEA-138 CRITICAL ALERT] ${cost.thresholdMessage} (Tiêu thụ: ${cost.totalCostVnd} VNĐ)`,
      );
      Sentry.captureMessage(
        `[WSEA-138 CRITICAL] Vượt hạn mức ngân sách AI: ${cost.totalCostVnd}/${cost.budgetLimitVnd} VND`,
        'fatal',
      );
    } else if (cost.thresholdStatus === BudgetThresholdStatus.HIGH_ALERT_85) {
      this.logger.warn(
        `[WSEA-138 HIGH ALERT] ${cost.thresholdMessage} (Tiêu thụ: ${cost.consumedPercentage}%)`,
      );
      Sentry.captureMessage(
        `[WSEA-138 WARNING] Ngân sách AI đạt ${cost.consumedPercentage}%: ${cost.totalCostVnd} VND`,
        'warning',
      );
    } else if (cost.thresholdStatus === BudgetThresholdStatus.WARNING_70) {
      this.logger.warn(`[WSEA-138 WARNING] ${cost.thresholdMessage}`);
    }
  }

  /**
   * Kiểm tra xem Circuit Breaker có đang ngắt gọi AI bên ngoài hay không
   */
  isCircuitBreakerOpen(): boolean {
    const cost = this.calculateTotalCost();
    return cost.circuitBreakerOpen;
  }

  /**
   * Bật/tắt cưỡng bức Circuit Breaker cho mục đích kiểm thử sự cố hoặc quản trị
   */
  setManualCircuitBreaker(state: boolean): boolean {
    this.manualCircuitBreaker = state;
    this.logger.warn(`Thao tác quản trị: Circuit Breaker được thiết lập thành = ${state}`);
    return this.manualCircuitBreaker;
  }

  /**
   * Đo lường tài nguyên hệ thống và ping kiểm tra AI Service trên Hugging Face
   */
  async getSystemResources(): Promise<AiMonitorSummary['resources']> {
    const memory = process.memoryUsage();
    const uptime = Math.floor(process.uptime());

    const aiServiceUrl =
      this.config.get<string>('AI_SERVICE_URL') || 'https://hieusss-wsea-ai-service.hf.space';
    let aiServiceStatus: 'UP' | 'DOWN' | 'DEGRADED' = 'DOWN';
    let latencyMs: number | null = null;
    let models: string[] = [];

    try {
      const start = Date.now();
      const res = await fetch(`${aiServiceUrl}/health`, { signal: AbortSignal.timeout(3000) });
      latencyMs = Date.now() - start;

      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { status?: string; models?: string[] };
        aiServiceStatus = data.status === 'ok' ? 'UP' : 'DEGRADED';
        models = data.models || [];
      } else if (res.status === 503) {
        aiServiceStatus = 'DEGRADED';
      }
    } catch {
      aiServiceStatus = 'DOWN';
      latencyMs = null;
    }

    return {
      memoryRssMb: Math.round((memory.rss / (1024 * 1024)) * 100) / 100,
      heapUsedMb: Math.round((memory.heapUsed / (1024 * 1024)) * 100) / 100,
      heapTotalMb: Math.round((memory.heapTotal / (1024 * 1024)) * 100) / 100,
      uptimeSeconds: uptime,
      aiServiceHealth: {
        status: aiServiceStatus,
        latencyMs,
        endpoint: aiServiceUrl,
        models,
      },
    };
  }

  /**
   * Lấy toàn bộ bản báo cáo tổng hợp tình trạng chi phí và tài nguyên (Summary Report)
   */
  async getSummary(): Promise<AiMonitorSummary> {
    const costs = this.calculateTotalCost();
    const resources = await this.getSystemResources();
    const successRate =
      this.totalCalls > 0 ? Math.round((this.successCalls / this.totalCalls) * 10000) / 100 : 100;
    const avgLatencyMs =
      this.totalCalls > 0 ? Math.round(this.totalLatencyMs / this.totalCalls) : 0;

    return {
      timestamp: new Date().toISOString(),
      totalCalls: this.totalCalls,
      successCalls: this.successCalls,
      failedCalls: this.failedCalls,
      successRate,
      avgLatencyMs,
      tokens: {
        promptTokens: this.totalPromptTokens,
        completionTokens: this.totalCompletionTokens,
        totalTokens: this.totalPromptTokens + this.totalCompletionTokens,
      },
      costs,
      services: this.serviceMetrics,
      resources,
    };
  }

  /**
   * Đặt lại bộ đếm cho kiểm thử hoặc chu kỳ mới
   */
  resetMetrics(): void {
    this.totalCalls = 0;
    this.successCalls = 0;
    this.failedCalls = 0;
    this.totalLatencyMs = 0;
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.manualCircuitBreaker = false;

    (Object.keys(this.serviceMetrics) as AiServiceType[]).forEach((key) => {
      this.serviceMetrics[key] = this.createEmptyMetric();
    });
  }
}
