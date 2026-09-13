import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthService } from './health.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('HealthService', () => {
  let service: HealthService;

  const mockPrisma = {
    $queryRaw: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<HealthService>(HealthService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return ok when database responds', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    const result = await service.check();
    expect(result.status).toBe('ok');
    expect(result.database.status).toBe('up');
    expect(result.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should throw ServiceUnavailableException when database fails', async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('DB Connection Refused'));

    await expect(service.check()).rejects.toThrow();
  });
});
