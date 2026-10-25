import { Logger } from '@nestjs/common';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  isRetryable?: (error: unknown) => boolean;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

const logger = new Logger('ExponentialBackoff');

/**
 * Tính toán thời gian trễ với Full Jitter:
 * delay = Math.floor(Math.random() * Math.min(maxDelayMs, baseDelayMs * 2^attempt))
 */
export function calculateJitterDelay(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 5000,
): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const ceiling = Math.min(maxDelayMs, exponential);
  return Math.floor(Math.random() * ceiling);
}

/**
 * Tạm dừng bất đồng bộ có hỗ trợ tín hiệu huỷ (AbortSignal)
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Yêu cầu đã bị huỷ trước khi chờ'));
    }

    const timer = setTimeout(() => {
      resolve();
    }, ms);

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('Yêu cầu đã bị huỷ giữa chừng'));
        },
        { once: true },
      );
    }
  });
}

/**
 * Kiểm tra xem lỗi có thuộc diện có thể thử lại (transient / cold start / network) hay không
 */
export function defaultIsRetryable(error: unknown): boolean {
  if (!error) return false;

  // Lỗi mạng phổ biến trong Node.js / undici
  const errMsg =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === 'string'
        ? error.toLowerCase()
        : '';
  if (
    errMsg.includes('503') ||
    errMsg.includes('502') ||
    errMsg.includes('504') ||
    errMsg.includes('429') ||
    errMsg.includes('econnreset') ||
    errMsg.includes('etimedout') ||
    errMsg.includes('econnrefused') ||
    errMsg.includes('fetch failed') ||
    errMsg.includes('loading') ||
    errMsg.includes('timeout')
  ) {
    return true;
  }

  // Nếu error có thuộc tính status / statusCode
  const maybeStatus =
    (error as { status?: number; statusCode?: number }).status ??
    (error as { status?: number; statusCode?: number }).statusCode;
  if (typeof maybeStatus === 'number' && [503, 502, 504, 429].includes(maybeStatus)) {
    return true;
  }

  return false;
}

/**
 * Thực thi hàm bất đồng bộ với cơ chế Exponential Backoff & Full Jitter
 */
export async function executeWithRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options?: RetryOptions,
): Promise<{ result: T; retriesUsed: number }> {
  const maxRetries = options?.maxRetries ?? 2;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 5000;
  const isRetryable = options?.isRetryable ?? defaultIsRetryable;

  let attempt = 0;

  while (true) {
    if (options?.signal?.aborted) {
      throw new Error('Yêu cầu đã bị người dùng huỷ');
    }

    try {
      const result = await fn(attempt);
      return { result, retriesUsed: attempt };
    } catch (err: unknown) {
      if (attempt >= maxRetries || !isRetryable(err) || options?.signal?.aborted) {
        throw err;
      }

      const delayMs = calculateJitterDelay(attempt, baseDelayMs, maxDelayMs);
      logger.warn(
        `[Infra-Buffer] Lần thử ${attempt + 1}/${maxRetries} thất bại (${err instanceof Error ? err.message : String(err)}). Thử lại sau ${delayMs}ms (Jitter Backoff)...`,
      );

      if (options?.onRetry) {
        options.onRetry(attempt + 1, delayMs, err);
      }

      await sleep(delayMs, options?.signal);
      attempt++;
    }
  }
}
