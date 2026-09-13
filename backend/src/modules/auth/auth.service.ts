import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { createHash, randomBytes } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { AuthProvider } from '@prisma/client';
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueRefreshToken(
    userId: string,
    meta: { userAgent?: string; ipAddress?: string },
  ) {
    const token = randomBytes(48).toString('base64url');
    const ttlDays = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 7);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(token),
        userId,
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    return { token, expiresAt };
  }

  async login(dto: LoginDto, meta: { userAgent?: string; ipAddress?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        `Tài khoản này đăng nhập bằng ${user.provider}. Vui lòng dùng nút đăng nhập tương ứng.`,
      );
    }

    const matched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matched) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị khoá');
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = await this.issueRefreshToken(user.id, meta);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  }

  async loginWithProvider(
    profile: {
      provider: AuthProvider;
      providerId: string;
      email: string;
      emailVerified: boolean;
      fullName: string;
      avatarUrl: string | null;
    },
    meta: { userAgent?: string; ipAddress?: string },
  ) {
    let user = await this.prisma.user.findUnique({
      where: {
        provider_providerId: {
          provider: profile.provider,
          providerId: profile.providerId,
        },
      },
    });

    if (!user) {
      const trungEmail = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (trungEmail) {
        // Chỉ gộp tài khoản khi nhà cung cấp khẳng định email đã xác minh
        if (!profile.emailVerified) {
          throw new ConflictException(
            'Email này đã có tài khoản. Vui lòng đăng nhập bằng mật khẩu.',
          );
        }
        user = await this.prisma.user.update({
          where: { id: trungEmail.id },
          data: {
            provider: profile.provider,
            providerId: profile.providerId,
            avatarUrl: trungEmail.avatarUrl ?? profile.avatarUrl,
          },
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            email: profile.email,
            fullName: profile.fullName,
            avatarUrl: profile.avatarUrl,
            provider: profile.provider,
            providerId: profile.providerId,
            passwordHash: null,
          },
        });
      }
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị khoá');
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = await this.issueRefreshToken(user.id, meta);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  }

  async register(dto: RegisterDto) {
    const saltRounds = Number(this.config.get('BCRYPT_SALT_ROUNDS') ?? 12);
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email,
          fullName: dto.fullName,
          passwordHash,
          provider: 'LOCAL',
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
          role: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email này đã được đăng ký');
      }
      throw error;
    }
  }
  async refresh(rawToken: string | undefined, meta: { userAgent?: string; ipAddress?: string }) {
    if (!rawToken) {
      throw new UnauthorizedException('Không tìm thấy refresh token');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }

    // Token đã thu hồi mà vẫn được dùng → dấu hiệu bị đánh cắp
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Phiên đăng nhập không an toàn, vui lòng đăng nhập lại');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị khoá');
    }

    // Xoay token: thu hồi cái cũ trước khi cấp cái mới
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const accessToken = await this.jwt.signAsync({
      sub: stored.user.id,
      email: stored.user.email,
      role: stored.user.role,
    });

    const refreshToken = await this.issueRefreshToken(stored.userId, meta);

    return {
      user: {
        id: stored.user.id,
        email: stored.user.email,
        fullName: stored.user.fullName,
        avatarUrl: stored.user.avatarUrl,
        role: stored.user.role,
      },
      accessToken,
      refreshToken,
    };
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
