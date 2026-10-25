export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export enum ResilienceFallbackReason {
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  COLD_START_503 = 'COLD_START_503',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED_429 = 'RATE_LIMITED_429',
  NETWORK_FAILURE = 'NETWORK_FAILURE',
}

export interface ResilienceConfig {
  failureThreshold: number; // Số lần lỗi liên tiếp để kích hoạt OPEN (mặc định: 3)
  resetTimeoutMs: number; // Thời gian ở trạng thái OPEN trước khi chuyển sang HALF_OPEN (mặc định: 20.000ms)
  halfOpenSuccessThreshold: number; // Số lần thành công ở HALF_OPEN để đóng lại CLOSED (mặc định: 2)
  maxRetries: number; // Số lần retry tối đa khi gặp lỗi tạm thời (mặc định: 2)
  baseDelayMs: number; // Thời gian chờ cơ sở cho backoff (mặc định: 1.000ms)
  maxDelayMs: number; // Thời gian chờ tối đa cho backoff (mặc định: 5.000ms)
  concurrencyLimit: number; // Số lượng request AI đồng thời tối đa (mặc định: 5)
}

export interface ResilienceTelemetry {
  circuitState: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  recoveredByRetry: number;
  fallbackCalls: number;
  activeConcurrentCalls: number;
  lastStateChange: string;
  lastError: string | null;
  lastFailureReason: ResilienceFallbackReason | null;
}

export interface WarmupResult {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  latencyMs: number | null;
  endpoint: string;
  message: string;
  timestamp: string;
}
