import { Logger } from '@nestjs/common';
import { CircuitState, ResilienceConfig } from './infra-resilience.types';

export class CircuitBreaker {
  private readonly logger = new Logger(CircuitBreaker.name);

  private state: CircuitState = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private openedAt = 0;
  private lastStateChange: string = new Date().toISOString();
  private lastError: string | null = null;

  constructor(private readonly config: ResilienceConfig) {}

  /**
   * Kiểm tra xem Circuit Breaker có cho phép thực hiện request hay không
   */
  canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      // Kiểm tra xem đã hết thời gian chờ reset chưa
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.transitionTo(CircuitState.HALF_OPEN);
        return true;
      }
      return false;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      // Cho phép request thăm dò (probe)
      return true;
    }

    return false;
  }

  /**
   * Ghi nhận một lượt gọi thành công
   */
  recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.config.halfOpenSuccessThreshold) {
        this.logger.log(
          `[CircuitBreaker] Thăm dò thành công ${this.consecutiveSuccesses} lần liên tiếp. Khôi phục trạng thái CLOSED!`,
        );
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Ghi nhận một lượt gọi thất bại
   */
  recordFailure(error?: unknown): void {
    const errorMsg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Lỗi không xác định';
    this.lastError = errorMsg;

    if (this.state === CircuitState.HALF_OPEN) {
      this.logger.warn(
        `[CircuitBreaker] Thử nghiệm ở HALF_OPEN thất bại (${errorMsg}). Kích hoạt lại OPEN trong ${this.config.resetTimeoutMs / 1000}s!`,
      );
      this.transitionTo(CircuitState.OPEN);
      return;
    }

    if (this.state === CircuitState.CLOSED) {
      this.consecutiveFailures++;
      this.logger.warn(
        `[CircuitBreaker] Ghi nhận lỗi hạ tầng ${this.consecutiveFailures}/${this.config.failureThreshold} (${errorMsg})`,
      );

      if (this.consecutiveFailures >= this.config.failureThreshold) {
        this.logger.error(
          `[CircuitBreaker] Vượt ngưỡng lỗi ${this.config.failureThreshold} lần liên tiếp! Kích hoạt ngắt OPEN trong ${this.config.resetTimeoutMs / 1000}s.`,
        );
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  /**
   * Bật cưỡng bức trạng thái OPEN (Phục vụ diễn tập sự cố hoặc kiểm thử)
   */
  trip(reason = 'Kích hoạt cưỡng bức bởi quản trị viên'): void {
    this.lastError = reason;
    this.transitionTo(CircuitState.OPEN);
  }

  /**
   * Đặt lại trạng thái về CLOSED
   */
  reset(): void {
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastError = null;
    this.transitionTo(CircuitState.CLOSED);
  }

  getState(): CircuitState {
    // Nếu đang ở OPEN nhưng đã hết hạn reset, cập nhật sang HALF_OPEN
    if (
      this.state === CircuitState.OPEN &&
      Date.now() - this.openedAt >= this.config.resetTimeoutMs
    ) {
      this.transitionTo(CircuitState.HALF_OPEN);
    }
    return this.state;
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  getConsecutiveSuccesses(): number {
    return this.consecutiveSuccesses;
  }

  getLastStateChange(): string {
    return this.lastStateChange;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  private transitionTo(newState: CircuitState): void {
    this.state = newState;
    this.lastStateChange = new Date().toISOString();

    if (newState === CircuitState.OPEN) {
      this.openedAt = Date.now();
      this.consecutiveSuccesses = 0;
    } else if (newState === CircuitState.CLOSED) {
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.consecutiveSuccesses = 0;
    }
  }
}
