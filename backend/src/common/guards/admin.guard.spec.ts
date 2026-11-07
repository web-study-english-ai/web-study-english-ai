import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let configService: ConfigService;

  const mockConfig: Record<string, string> = {
    ADMIN_API_KEY: 'test-admin-secret-key-12345',
    AI_SERVICE_KEY: 'test-ai-service-key-67890',
    JWT_ACCESS_SECRET: 'test-jwt-secret',
  };

  beforeEach(() => {
    configService = {
      get: vi.fn((key: string) => mockConfig[key]),
      getOrThrow: vi.fn((key: string) => mockConfig[key]),
    } as unknown as ConfigService;

    guard = new AdminGuard(configService);
  });

  const createMockContext = (headers: Record<string, string> = {}, user?: any): ExecutionContext => {
    const request = {
      headers,
      user,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
    } as unknown as ExecutionContext;
  };

  it('cho phép truy cập khi header x-admin-key khớp ADMIN_API_KEY', async () => {
    const context = createMockContext({
      'x-admin-key': 'test-admin-secret-key-12345',
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('cho phép truy cập khi header x-admin-key khớp AI_SERVICE_KEY', async () => {
    const context = createMockContext({
      'x-admin-key': 'test-ai-service-key-67890',
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('cho phép truy cập khi Authorization Bearer khớp ADMIN_API_KEY', async () => {
    const context = createMockContext({
      authorization: 'Bearer test-admin-secret-key-12345',
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('chặn truy cập (401) khi không có bất kỳ header xác thực nào', async () => {
    const context = createMockContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('chặn truy cập (401) khi x-admin-key sai và không có Bearer token', async () => {
    const context = createMockContext({
      'x-admin-key': 'wrong-key',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('cho phép truy cập khi JWT hợp lệ và user có role ADMIN', async () => {
    const context = createMockContext(
      {
        authorization: 'Bearer valid.jwt.token',
      },
      { id: 'admin-id', role: 'ADMIN', email: 'admin@example.com' },
    );

    // Mock passport AuthGuard.canActivate
    vi.spyOn(Object.getPrototypeOf(AdminGuard.prototype), 'canActivate').mockResolvedValue(true);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('từ chối truy cập (403) khi JWT hợp lệ nhưng user có role USER (không phải ADMIN)', async () => {
    const context = createMockContext(
      {
        authorization: 'Bearer valid.jwt.token',
      },
      { id: 'user-id', role: 'USER', email: 'user@example.com' },
    );

    vi.spyOn(Object.getPrototypeOf(AdminGuard.prototype), 'canActivate').mockResolvedValue(true);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
