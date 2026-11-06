import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@/prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

const profileSelect = {
  id: true,
  email: true,
  fullName: true,
  avatarUrl: true,
  role: true,
  level: true,
  newWordsPerDay: true,
  maxReviewsPerDay: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const { name, fullName, newPassword, language, ...rest } = dto;
    void language;

    const data: Prisma.UserUpdateInput = {
      ...rest,
      ...(fullName || name ? { fullName: fullName ?? name } : {}),
    };

    if (newPassword) {
      const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
      data.passwordHash = await bcrypt.hash(newPassword, saltRounds);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: profileSelect,
    });
  }
}
