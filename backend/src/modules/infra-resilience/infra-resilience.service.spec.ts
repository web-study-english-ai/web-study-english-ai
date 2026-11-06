import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InfraResilienceService } from './infra-resilience.service';
import { CircuitState, ResilienceFallbackReason } from './infra-resilience.types';

describe('InfraResilienceService', () => {
  let service: InfraResilienceService;

  beforeEach(async () => {
    vi.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InfraResilienceService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'RESILIENCE_FAILURE_THRESHOLD') return 3;
              if (key === 'RESILIENCE_RESET_TIMEOUT_MS') return 10_000;
              if (key === 'RESILIENCE_HALF_OPEN_THRESHOLD') return 2;
              if (key === 'RESILIENCE_MAX_RETRIES') return 2;
              if (key === 'RESILIENCE_BASE_DELAY_MS') return 100;
              if (key === 'RESILIENCE_MAX_DELAY_MS') return 500;
              if (key === 'RESILIENCE_CONCURRENCY_LIMIT') return 2;
              if (key === 'AI_SERVICE_URL') return 'https://test-ai.hf.space';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<InfraResilienceService>(InfraResilienceService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should initialize with CLOSED state and zero failure count', () => {
    const telemetry = service.getTelemetry();
    expect(telemetry.circuitState).toBe(CircuitState.CLOSED);
    expect(telemetry.consecutiveFailures).toBe(0);
    expect(telemetry.totalCalls).toBe(0);
  });

  it('should successfully execute healthy operation without fallback', async () => {
    const op = vi.fn().mockResolvedValue({ status: 'ok', data: 42 });
    const fallback = vi.fn().mockReturnValue(null);

    const resultPromise = service.executeWithResilience(op, fallback);
    const result = await resultPromise;

    expect(result).toEqual({ status: 'ok', data: 42 });
    expect(op).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();

    const telemetry = service.getTelemetry();
    expect(telemetry.successfulCalls).toBe(1);
    expect(telemetry.circuitState).toBe(CircuitState.CLOSED);
  });

  it('should retry transient 503 error and recover when downstream wakes up', async () => {
    let callCount = 0;
    const op = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('503 Service Unavailable (Model loading)'));
      }
      return Promise.resolve('recovered-data');
    });
    const fallback = vi.fn();

    const promise = service.executeWithResilience(op, fallback, {
      retryOptions: { baseDelayMs: 50, maxDelayMs: 100 },
    });

    // Advance timers for exponential backoff delay
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('recovered-data');
    expect(op).toHaveBeenCalledTimes(2);
    expect(fallback).not.toHaveBeenCalled();

    const telemetry = service.getTelemetry();
    expect(telemetry.recoveredByRetry).toBe(1);
    expect(telemetry.successfulCalls).toBe(1);
  });

  it('should trip Circuit Breaker to OPEN after 3 consecutive failures and invoke fallback', async () => {
    const op = vi.fn().mockRejectedValue(new Error('Connection timeout 504'));
    const fallback = vi.fn().mockReturnValue('fallback-response');

    // Call 1
    const p1 = service.executeWithResilience(op, fallback, {
      retryOptions: { maxRetries: 0 },
    });
    const r1 = await p1;
    expect(r1).toBe('fallback-response');
    expect(service.getTelemetry().circuitState).toBe(CircuitState.CLOSED);

    // Call 2
    const p2 = service.executeWithResilience(op, fallback, {
      retryOptions: { maxRetries: 0 },
    });
    const r2 = await p2;
    expect(r2).toBe('fallback-response');
    expect(service.getTelemetry().circuitState).toBe(CircuitState.CLOSED);

    // Call 3 -> should trip to OPEN
    const p3 = service.executeWithResilience(op, fallback, {
      retryOptions: { maxRetries: 0 },
    });
    const r3 = await p3;
    expect(r3).toBe('fallback-response');
    expect(service.getTelemetry().circuitState).toBe(CircuitState.OPEN);
  });

  it('should immediately return fallback (0ms) without calling downstream when Circuit Breaker is OPEN', async () => {
    // Manually trip circuit
    service.tripCircuit('Downstream space down');
    expect(service.getTelemetry().circuitState).toBe(CircuitState.OPEN);

    const op = vi.fn();
    const fallback = vi.fn().mockImplementation((reason) => {
      return `offline-result-${reason}`;
    });

    const res = await service.executeWithResilience(op, fallback);

    expect(res).toBe(`offline-result-${ResilienceFallbackReason.CIRCUIT_OPEN}`);
    expect(op).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledWith(ResilienceFallbackReason.CIRCUIT_OPEN);
  });

  it('should transition from OPEN to HALF_OPEN after resetTimeoutMs expires, then close on successful probes', async () => {
    service.tripCircuit('Testing probe');
    expect(service.getTelemetry().circuitState).toBe(CircuitState.OPEN);

    // Fast-forward 10,000ms (resetTimeoutMs)
    vi.advanceTimersByTime(10_000);
    expect(service.getTelemetry().circuitState).toBe(CircuitState.HALF_OPEN);

    const op = vi.fn().mockResolvedValue('probe-success');
    const fallback = vi.fn();

    // Probe 1
    await service.executeWithResilience(op, fallback);
    expect(service.getTelemetry().circuitState).toBe(CircuitState.HALF_OPEN);

    // Probe 2 (threshold is 2)
    await service.executeWithResilience(op, fallback);
    expect(service.getTelemetry().circuitState).toBe(CircuitState.CLOSED);
    expect(service.getTelemetry().consecutiveFailures).toBe(0);
  });

  it('should re-open circuit if probe fails in HALF_OPEN state', async () => {
    service.tripCircuit('Testing probe failure');
    vi.advanceTimersByTime(10_000);
    expect(service.getTelemetry().circuitState).toBe(CircuitState.HALF_OPEN);

    const op = vi.fn().mockRejectedValue(new Error('Downstream still dead'));
    const fallback = vi.fn().mockReturnValue('fallback-during-probe');

    const res = await service.executeWithResilience(op, fallback, {
      retryOptions: { maxRetries: 0 },
    });

    expect(res).toBe('fallback-during-probe');
    expect(service.getTelemetry().circuitState).toBe(CircuitState.OPEN);
  });

  it('should throttle concurrent calls using ConcurrencyLimiter', async () => {
    let active = 0;
    let maxActiveSeen = 0;

    const op = vi.fn().mockImplementation(async () => {
      active++;
      if (active > maxActiveSeen) maxActiveSeen = active;
      await new Promise((r) => setTimeout(r, 100));
      active--;
      return 'done';
    });
    const fallback = vi.fn();

    // Launch 4 parallel requests (concurrency limit is 2)
    const p1 = service.executeWithResilience(op, fallback);
    const p2 = service.executeWithResilience(op, fallback);
    const p3 = service.executeWithResilience(op, fallback);
    const p4 = service.executeWithResilience(op, fallback);

    await vi.runAllTimersAsync();
    await Promise.all([p1, p2, p3, p4]);

    // Max active calls should never exceed 2
    expect(maxActiveSeen).toBeLessThanOrEqual(2);
  });

  it('should perform warm-up ping and return health status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      }),
    );

    const warmup = await service.warmupAiService();
    expect(warmup.status).toBe('UP');
    expect(warmup.endpoint).toBe('https://test-ai.hf.space');
    expect(warmup.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should allow manual circuit trip, reset, and metrics clearing', () => {
    service.tripCircuit('Admin maintenance');
    expect(service.getTelemetry().circuitState).toBe(CircuitState.OPEN);

    service.resetCircuit();
    expect(service.getTelemetry().circuitState).toBe(CircuitState.CLOSED);

    service.resetMetrics();
    expect(service.getTelemetry().totalCalls).toBe(0);
  });
});
