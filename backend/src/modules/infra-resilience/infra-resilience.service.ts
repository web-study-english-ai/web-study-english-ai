import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CircuitBreaker } from './circuit-breaker';
import { ConcurrencyLimiter } from './concurrency-limiter';
import { executeWithRetry, RetryOptions } from './exponential-backoff';
import {
  ResilienceConfig,
  ResilienceFallbackReason,
  ResilienceTelemetry,
  WarmupResult,
} from './infra-resilience.types';

@Injectable()
export class InfraResilienceService implements OnModuleInit {
  private readonly logger = new Logger(InfraResilienceService.name);

  private readonly config: ResilienceConfig;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly concurrencyLimiter: ConcurrencyLimiter;

  // Telemetry metrics
  private totalCalls = 0;
  private successfulCalls = 0;
  private failedCalls = 0;
  private recoveredByRetry = 0;
  private fallbackCalls = 0;
  private lastFailureReason: ResilienceFallbackReason | null = null;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      failureThreshold: Number(this.configService.get('RESILIENCE_FAILURE_THRESHOLD') ?? 3),
      resetTimeoutMs: Number(this.configService.get('RESILIENCE_RESET_TIMEOUT_MS') ?? 20_000),
      halfOpenSuccessThreshold: Number(
        this.configService.get('RESILIENCE_HALF_OPEN_THRESHOLD') ?? 2,
      ),
      maxRetries: Number(this.configService.get('RESILIENCE_MAX_RETRIES') ?? 2),
      baseDelayMs: Number(this.configService.get('RESILIENCE_BASE_DELAY_MS') ?? 1000),
      maxDelayMs: Number(this.configService.get('RESILIENCE_MAX_DELAY_MS') ?? 5000),
      concurrencyLimit: Number(this.configService.get('RESILIENCE_CONCURRENCY_LIMIT') ?? 5),
    };

    this.circuitBreaker = new CircuitBreaker(this.config);
    this.concurrencyLimiter = new ConcurrencyLimiter(this.config.concurrencyLimit);
  }

  onModuleInit() {
    this.logger.log(
      `🛡️ Khởi tạo InfraResilienceService: CircuitBreaker (Thresh: ${this.config.failureThreshold}, Timeout: ${this.config.resetTimeoutMs}ms), ConcurrencyLimit: ${this.config.concurrencyLimit}`,
    );
  }

  /**
   * Thực thi thao tác gọi hạ tầng kèm theo bộ đệm xử lý sự cố toàn diện:
   * 1. Kiểm tra Circuit Breaker (ngắt sớm nếu hạ tầng sập).
   * 2. Bộ đệm kiểm soát tải đồng thời (Concurrency Limiter).
   * 3. Cơ chế thử lại thông minh với Exponential Backoff & Jitter.
   * 4. Chuyển đổi dự phòng (Graceful Fallback) không để lộ lỗi 500 ra người dùng.
   */
  async executeWithResilience<T>(
    operation: () => Promise<T>,
    fallback: (reason: ResilienceFallbackReason, error?: unknown) => Promise<T> | T,
    options?: {
      retryOptions?: RetryOptions;
      serviceName?: string;
    },
  ): Promise<T> {
    this.totalCalls++;
    const serviceName = options?.serviceName ?? 'AI-Service';

    // 1. Kiểm tra trạng thái Circuit Breaker
    if (!this.circuitBreaker.canExecute()) {
      this.fallbackCalls++;
      this.lastFailureReason = ResilienceFallbackReason.CIRCUIT_OPEN;
      this.logger.warn(
        `[Infra-Buffer] Circuit Breaker đang OPEN cho ${serviceName}. Lập tức chuyển sang chế độ dự phòng (0ms Fallback)`,
      );
      return fallback(ResilienceFallbackReason.CIRCUIT_OPEN);
    }

    // 2. Chờ cấp quyền tải đồng thời (Semaphore)
    const release = await this.concurrencyLimiter.acquire();

    try {
      // 3. Thực thi kèm cơ chế Exponential Backoff & Jitter
      const retryOpts: RetryOptions = {
        maxRetries: options?.retryOptions?.maxRetries ?? this.config.maxRetries,
        baseDelayMs: options?.retryOptions?.baseDelayMs ?? this.config.baseDelayMs,
        maxDelayMs: options?.retryOptions?.maxDelayMs ?? this.config.maxDelayMs,
        signal: options?.retryOptions?.signal,
        onRetry: (attempt, delayMs, err) => {
          this.logger.warn(
            `[Infra-Buffer] ${serviceName} thử lại lần ${attempt} sau ${delayMs}ms do: ${err instanceof Error ? err.message : String(err)}`,
          );
        },
      };

      const { result, retriesUsed } = await executeWithRetry(() => operation(), retryOpts);

      // Ghi nhận thành công
      this.successfulCalls++;
      if (retriesUsed > 0) {
        this.recoveredByRetry++;
        this.logger.log(
          `[Infra-Buffer] ${serviceName} đã phục hồi thành công sau ${retriesUsed} lần thử lại!`,
        );
      }

      this.circuitBreaker.recordSuccess();
      return result;
    } catch (err: unknown) {
      // Ghi nhận thất bại và cập nhật trạng thái rào chắn
      this.failedCalls++;
      this.fallbackCalls++;
      this.circuitBreaker.recordFailure(err);

      const errMsg = err instanceof Error ? err.message : String(err);
      let reason = ResilienceFallbackReason.NETWORK_FAILURE;

      if (errMsg.includes('503')) {
        reason = ResilienceFallbackReason.COLD_START_503;
      } else if (errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT')) {
        reason = ResilienceFallbackReason.TIMEOUT;
      } else if (errMsg.includes('429')) {
        reason = ResilienceFallbackReason.RATE_LIMITED_429;
      }

      this.lastFailureReason = reason;
      this.logger.error(
        `[Infra-Buffer] ${serviceName} gặp sự cố (${errMsg}). Tự động kích hoạt cơ chế dự phòng an toàn`,
      );

      return fallback(reason, err);
    } finally {
      release();
    }
  }

  /**
   * Cơ chế làm ấm mô hình (Warm-up Buffer) ngăn ngừa sự cố Cold Start trên Hugging Face
   */
  async warmupAiService(): Promise<WarmupResult> {
    const aiServiceUrl =
      this.configService.get<string>('AI_SERVICE_URL') ||
      'https://hieusss-wsea-ai-service.hf.space';
    const start = Date.now();

    try {
      const response = await fetch(`${aiServiceUrl}/health`, {
        signal: AbortSignal.timeout(6000),
      });

      const latencyMs = Date.now() - start;

      if (response.ok) {
        return {
          status: 'UP',
          latencyMs,
          endpoint: aiServiceUrl,
          message: 'Dịch vụ AI sẵn sàng, mô hình đã được làm ấm (Warm)',
          timestamp: new Date().toISOString(),
        };
      }

      if (response.status === 503) {
        return {
          status: 'DEGRADED',
          latencyMs,
          endpoint: aiServiceUrl,
          message: 'Dịch vụ AI đang khởi động nạp mô hình (Cold Start 503)',
          timestamp: new Date().toISOString(),
        };
      }

      return {
        status: 'DEGRADED',
        latencyMs,
        endpoint: aiServiceUrl,
        message: `Dịch vụ AI trả mã trạng thái ${response.status}`,
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      return {
        status: 'DOWN',
        latencyMs: null,
        endpoint: aiServiceUrl,
        message: `Không kết nối được dịch vụ AI: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Lấy báo cáo tình trạng toàn diện của hệ thống đệm sự cố hạ tầng
   */
  getTelemetry(): ResilienceTelemetry {
    return {
      circuitState: this.circuitBreaker.getState(),
      consecutiveFailures: this.circuitBreaker.getConsecutiveFailures(),
      consecutiveSuccesses: this.circuitBreaker.getConsecutiveSuccesses(),
      totalCalls: this.totalCalls,
      successfulCalls: this.successfulCalls,
      failedCalls: this.failedCalls,
      recoveredByRetry: this.recoveredByRetry,
      fallbackCalls: this.fallbackCalls,
      activeConcurrentCalls: this.concurrencyLimiter.getActiveCount(),
      lastStateChange: this.circuitBreaker.getLastStateChange(),
      lastError: this.circuitBreaker.getLastError(),
      lastFailureReason: this.lastFailureReason,
    };
  }

  /**
   * Bật cưỡng bức trạng thái ngắt Circuit Breaker (Test kịch bản sự cố)
   */
  tripCircuit(reason = 'Kích hoạt cưỡng bức'): void {
    this.circuitBreaker.trip(reason);
  }

  /**
   * Khôi phục trạng thái Circuit Breaker về CLOSED
   */
  resetCircuit(): void {
    this.circuitBreaker.reset();
    this.lastFailureReason = null;
  }

  /**
   * Đặt lại toàn bộ bộ đếm đo lường
   */
  resetMetrics(): void {
    this.totalCalls = 0;
    this.successfulCalls = 0;
    this.failedCalls = 0;
    this.recoveredByRetry = 0;
    this.fallbackCalls = 0;
    this.lastFailureReason = null;
    this.circuitBreaker.reset();
  }
}
