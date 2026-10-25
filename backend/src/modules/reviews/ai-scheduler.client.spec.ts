import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { AiSchedulerClient } from './ai-scheduler.client';
import { AiMonitorService } from '@modules/ai-monitor/ai-monitor.service';
import { TheGuiAI } from './ai-scheduler.types';

describe('AiSchedulerClient with AiMonitor', () => {
  let client: AiSchedulerClient;
  let configService: ConfigService;
  let aiMonitor: AiMonitorService;

  const mockCards: TheGuiAI[] = [
    { card_id: 'c1', reps: 2, lapses: 0, last_interval: 1, last_review: '2026-10-20T00:00:00Z', rating: 3 },
  ];

  beforeEach(() => {
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'AI_SERVICE_URL') return 'https://ai.example.com';
        if (key === 'AI_SERVICE_KEY') return 'test-key-123';
        if (key === 'AI_TIMEOUT_MS') return 1000;
        return null;
      }),
      getOrThrow: vi.fn((key: string) => {
        if (key === 'AI_SERVICE_URL') return 'https://ai.example.com';
        if (key === 'AI_SERVICE_KEY') return 'test-key-123';
        throw new Error(`Missing ${key}`);
      }),
    } as unknown as ConfigService;

    aiMonitor = {
      isCircuitBreakerOpen: vi.fn().mockReturnValue(false),
      recordCall: vi.fn(),
    } as unknown as AiMonitorService;

    client = new AiSchedulerClient(configService, aiMonitor);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should immediately return null (offline fallback) if Circuit Breaker is open', async () => {
    vi.mocked(aiMonitor.isCircuitBreakerOpen).mockReturnValue(true);

    const result = await client.duBao(mockCards);
    expect(result).toBeNull();
    // fetch should not be called at all
    expect(aiMonitor.recordCall).not.toHaveBeenCalled();
  });

  it('should call AI service and record successful metrics when Circuit Breaker is closed', async () => {
    const mockApiResponse = {
      predictions: [
        {
          card_id: 'c1',
          predicted_retention: 0.88,
          suggested_interval: 3,
          stability: 3.5,
          difficulty: 4.0,
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockApiResponse,
    });

    const result = await client.duBao(mockCards);
    expect(result).toEqual(mockApiResponse);
    expect(aiMonitor.recordCall).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceType: 'FSRS_RETENTION',
        success: true,
        statusCode: 200,
      }),
    );
  });

  it('should record failed call metric when AI service returns 500 error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const result = await client.duBao(mockCards);
    expect(result).toBeNull();
    expect(aiMonitor.recordCall).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceType: 'FSRS_RETENTION',
        success: false,
        statusCode: 500,
      }),
    );
  });
});
