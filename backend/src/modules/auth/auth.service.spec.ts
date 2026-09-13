import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthService } from './auth.service';

const prismaMock = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  refreshToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
};

const configMock = {
  get: vi.fn((key: string) => {
    const values: Record<string, string> = {
      BCRYPT_SALT_ROUNDS: '4',
      REFRESH_TOKEN_TTL_DAYS: '7',
    };
    return values[key];
  }),
};

const jwtMock = {
  signAsync: vi.fn().mockResolvedValue('fake.access.token'),
};

describe('AuthService', () => {
  let service: AuthService;

  const plainPassword = 'matkhau12345';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(plainPassword, 4);
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
        { provide: JwtService, useValue: jwtMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ---------- register ----------

  describe('register', () => {
    it('băm mật khẩu trước khi lưu, không bao giờ lưu bản gốc', async () => {
      prismaMock.user.create.mockResolvedValue({ id: 'u1' });

      await service.register({
        fullName: 'Thạc Duy Anh',
        email: 'duyanh@example.com',
        password: plainPassword,
        confirmPassword: plainPassword,
      });

      const arg = prismaMock.user.create.mock.calls[0][0];
      expect(arg.data.passwordHash).not.toBe(plainPassword);
      expect(arg.data.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(await bcrypt.compare(plainPassword, arg.data.passwordHash)).toBe(true);
    });

    it('không trả passwordHash ra ngoài', async () => {
      prismaMock.user.create.mockResolvedValue({ id: 'u1' });

      await service.register({
        fullName: 'Thạc Duy Anh',
        email: 'duyanh@example.com',
        password: plainPassword,
        confirmPassword: plainPassword,
      });

      const arg = prismaMock.user.create.mock.calls[0][0];
      expect(arg.select.passwordHash).toBeUndefined();
    });

    it('ném ConflictException khi email đã tồn tại', async () => {
      prismaMock.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(
        service.register({
          fullName: 'Thạc Duy Anh',
          email: 'duyanh@example.com',
          password: plainPassword,
          confirmPassword: plainPassword,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ---------- login ----------

  describe('login', () => {
    const activeUser = {
      id: 'u1',
      email: 'duyanh@example.com',
      fullName: 'Thạc Duy Anh',
      avatarUrl: null,
      role: 'USER',
      isActive: true,
      provider: 'LOCAL',
      passwordHash: '',
    };

    it('email sai và mật khẩu sai trả về CÙNG một thông báo', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      const notFound = await service
        .login({ email: 'khong-ton-tai@example.com', password: 'abc' }, {})
        .catch((e) => e.message);

      prismaMock.user.findUnique.mockResolvedValue({ ...activeUser, passwordHash });
      const wrongPassword = await service
        .login({ email: activeUser.email, password: 'sai-mat-khau' }, {})
        .catch((e) => e.message);

      expect(notFound).toBe(wrongPassword);
    });

    it('chặn đăng nhập bằng mật khẩu với tài khoản Google/Facebook', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...activeUser,
        provider: 'GOOGLE',
        passwordHash: null,
      });

      await expect(service.login({ email: activeUser.email, password: 'abc' }, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('chặn tài khoản đã bị khoá', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...activeUser,
        passwordHash,
        isActive: false,
      });

      await expect(
        service.login({ email: activeUser.email, password: plainPassword }, {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('đăng nhập đúng thì trả access token và không lộ passwordHash', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ ...activeUser, passwordHash });
      prismaMock.refreshToken.create.mockResolvedValue({});

      const result = await service.login({ email: activeUser.email, password: plainPassword }, {});

      expect(result.accessToken).toBe('fake.access.token');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('lưu bản băm của refresh token, không lưu token gốc', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ ...activeUser, passwordHash });
      prismaMock.refreshToken.create.mockResolvedValue({});

      const result = await service.login({ email: activeUser.email, password: plainPassword }, {});

      const saved = prismaMock.refreshToken.create.mock.calls[0][0].data.tokenHash;
      expect(saved).not.toBe(result.refreshToken.token);
      expect(saved).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ---------- refresh ----------

  describe('refresh', () => {
    it('thu hồi toàn bộ token của user khi phát hiện token đã bị thu hồi được dùng lại', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: new Date(),
        user: { id: 'u1', isActive: true },
      });

      await expect(service.refresh('token-bi-danh-cap', {})).rejects.toThrow(UnauthorizedException);

      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('từ chối token đã hết hạn', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        user: { id: 'u1', isActive: true },
      });

      await expect(service.refresh('token-het-han', {})).rejects.toThrow(UnauthorizedException);
    });

    it('thu hồi token cũ trước khi cấp token mới', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
        user: {
          id: 'u1',
          email: 'duyanh@example.com',
          fullName: 'Thạc Duy Anh',
          avatarUrl: null,
          role: 'USER',
          isActive: true,
        },
      });
      prismaMock.refreshToken.create.mockResolvedValue({});

      await service.refresh('token-hop-le', {});

      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
    });
  });
});
