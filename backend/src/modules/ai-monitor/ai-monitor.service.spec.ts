import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AiMonitorService, BudgetThresholdStatus } from './ai-monitor.service';

describe('AiMonitorService', () => {
  let service: AiMonitorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiMonitorService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'AI_SERVICE_URL') return 'https://test-ai.hf.space';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AiMonitorService>(AiMonitorService);
  });

  it('should be defined and initialize with default 0 metrics', async () => {
    expect(service).toBeDefined();
    const summary = await service.getSummary();

    expect(summary.totalCalls).toBe(0);
    expect(summary.successCalls).toBe(0);
    expect(summary.failedCalls).toBe(0);
    expect(summary.tokens.totalTokens).toBe(0);
    expect(summary.costs.totalCostUsd).toBe(0);
    expect(summary.costs.totalCostVnd).toBe(0);
    expect(summary.costs.budgetLimitVnd).toBe(500_000);
    expect(summary.costs.thresholdStatus).toBe(BudgetThresholdStatus.NORMAL);
    expect(summary.costs.circuitBreakerOpen).toBe(false);
  });

  it('should record calls and calculate cost accurately based on token pricing', async () => {
    // 1M prompt tokens = $0.15 USD; 500k completion tokens = $0.30 USD
    // Total USD = $0.45 USD * 25,000 VND = 11,250 VND
    service.recordCall({
      serviceType: 'LLM_ASSISTANT_RAG',
      promptTokens: 1_000_000,
      completionTokens: 500_000,
      latencyMs: 350,
      success: true,
      statusCode: 200,
    });

    const summary = await service.getSummary();
    expect(summary.totalCalls).toBe(1);
    expect(summary.successCalls).toBe(1);
    expect(summary.failedCalls).toBe(0);
    expect(summary.successRate).toBe(100);
    expect(summary.tokens.promptTokens).toBe(1_000_000);
    expect(summary.tokens.completionTokens).toBe(500_000);
    expect(summary.tokens.totalTokens).toBe(1_500_000);

    expect(summary.costs.totalCostUsd).toBeCloseTo(0.45, 4);
    expect(summary.costs.totalCostVnd).toBe(11_250);
    expect(summary.costs.consumedPercentage).toBeCloseTo(2.25, 2);
    expect(summary.costs.thresholdStatus).toBe(BudgetThresholdStatus.NORMAL);
    expect(service.isCircuitBreakerOpen()).toBe(false);
  });

  it('should transition to WARNING_70 when consumed >= 70% (350,000 VND)', () => {
    // $14.00 USD * 25,000 VND = 350,000 VND (Exactly 70%)
    // At $0.60 / 1M completion: $14.00 / $0.60 = 23,333,334 tokens
    service.recordCall({
      serviceType: 'FSRS_RETENTION',
      promptTokens: 0,
      completionTokens: 23_333_334,
      latencyMs: 120,
      success: true,
      statusCode: 200,
    });

    const cost = service.calculateTotalCost();
    expect(cost.totalCostVnd).toBeGreaterThanOrEqual(350_000);
    expect(cost.thresholdStatus).toBe(BudgetThresholdStatus.WARNING_70);
    expect(service.isCircuitBreakerOpen()).toBe(false);
  });

  it('should transition to HIGH_ALERT_85 when consumed >= 85% (425,000 VND)', () => {
    // $17.00 USD * 25,000 VND = 425,000 VND (85%)
    // At $0.60 / 1M completion: $17.00 / $0.60 = 28,333,334 tokens
    service.recordCall({
      serviceType: 'LLM_ASSISTANT_RAG',
      promptTokens: 0,
      completionTokens: 28_333_334,
      latencyMs: 500,
      success: true,
      statusCode: 200,
    });

    const cost = service.calculateTotalCost();
    expect(cost.totalCostVnd).toBeGreaterThanOrEqual(425_000);
    expect(cost.thresholdStatus).toBe(BudgetThresholdStatus.HIGH_ALERT_85);
    expect(service.isCircuitBreakerOpen()).toBe(false);
  });

  it('should trigger CIRCUIT_BREAKER_TRIGGERED and open circuit breaker when consumed >= 100% (500,000 VND)', () => {
    // $20.00 USD * 25,000 VND = 500,000 VND (100%)
    // At $0.60 / 1M completion: $20.00 / $0.60 = 33,333,334 tokens
    service.recordCall({
      serviceType: 'LLM_ASSISTANT_RAG',
      promptTokens: 0,
      completionTokens: 33_333_334,
      latencyMs: 600,
      success: true,
      statusCode: 200,
    });

    const cost = service.calculateTotalCost();
    expect(cost.totalCostVnd).toBeGreaterThanOrEqual(500_000);
    expect(cost.thresholdStatus).toBe(BudgetThresholdStatus.CIRCUIT_BREAKER_TRIGGERED);
    expect(cost.circuitBreakerOpen).toBe(true);
    expect(service.isCircuitBreakerOpen()).toBe(true);
  });

  it('should support manual circuit breaker override for administrative control', () => {
    expect(service.isCircuitBreakerOpen()).toBe(false);

    // Turn manual circuit breaker ON
    service.setManualCircuitBreaker(true);
    expect(service.isCircuitBreakerOpen()).toBe(true);

    // Turn manual circuit breaker OFF
    service.setManualCircuitBreaker(false);
    expect(service.isCircuitBreakerOpen()).toBe(false);
  });

  it('should measure system resources (memory, uptime, health)', async () => {
    const resources = await service.getSystemResources();

    expect(resources.memoryRssMb).toBeGreaterThan(0);
    expect(resources.heapUsedMb).toBeGreaterThan(0);
    expect(resources.heapTotalMb).toBeGreaterThan(0);
    expect(resources.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(resources.aiServiceHealth).toBeDefined();
    expect(resources.aiServiceHealth.endpoint).toBe('https://test-ai.hf.space');
  });

  it('should reset all metrics when resetMetrics is called', () => {
    service.recordCall({
      serviceType: 'FSRS_RETENTION',
      promptTokens: 100,
      completionTokens: 50,
      latencyMs: 15,
      success: true,
      statusCode: 200,
    });

    expect(service.calculateTotalCost().totalCostVnd).toBeGreaterThanOrEqual(0);

    service.resetMetrics();
    const cost = service.calculateTotalCost();
    expect(cost.totalCostVnd).toBe(0);
    expect(cost.thresholdStatus).toBe(BudgetThresholdStatus.NORMAL);
  });
});
