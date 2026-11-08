import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { VisionStorageService } from '../vision/vision-storage.service';
import type { TepAnhTaiLen } from '../vision/vision.types';
import { UpdateProfileDto } from './dto/update-profile.dto';

const ALLOWED_AVATAR_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

const profileSelect = {
  id: true,
  email: true,
  fullName: true,
  avatarUrl: true,
  phone: true,
  address: true,
  dateOfBirth: true,
  role: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visionStorage: VisionStorageService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    return {
      ...user,
      dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : null,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const { fullName, currentPassword, newPassword, phone, address, dateOfBirth, avatarUrl } = dto;

    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!existingUser) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    const data: Prisma.UserUpdateInput = {};

    if (fullName !== undefined) {
      data.fullName = fullName;
    }

    if (avatarUrl !== undefined) {
      data.avatarUrl = avatarUrl;
    }

    if (phone !== undefined) {
      data.phone = phone && phone.trim() !== '' ? phone.trim() : null;
    }

    if (address !== undefined) {
      data.address = address && address.trim() !== '' ? address.trim() : null;
    }

    if (dateOfBirth !== undefined) {
      if (!dateOfBirth || dateOfBirth.trim() === '') {
        data.dateOfBirth = null;
      } else {
        const parsedDate = new Date(dateOfBirth);
        if (Number.isNaN(parsedDate.getTime())) {
          throw new BadRequestException('Ngày sinh không hợp lệ (định dạng YYYY-MM-DD)');
        }
        data.dateOfBirth = parsedDate;
      }
    }

    if (newPassword) {
      if (existingUser.passwordHash) {
        if (!currentPassword) {
          throw new BadRequestException('Vui lòng nhập mật khẩu hiện tại');
        }
        const isMatch = await bcrypt.compare(currentPassword, existingUser.passwordHash);
        if (!isMatch) {
          throw new BadRequestException('Mật khẩu hiện tại không đúng');
        }
      }

      const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
      data.passwordHash = await bcrypt.hash(newPassword, saltRounds);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: profileSelect,
    });

    return {
      ...updated,
      dateOfBirth: updated.dateOfBirth ? updated.dateOfBirth.toISOString().slice(0, 10) : null,
    };
  }

  async uploadAvatar(userId: string, file?: TepAnhTaiLen) {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Vui lòng chọn tệp ảnh đại diện');
    }

    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_AVATAR_MIMES.has(mime)) {
      throw new BadRequestException('Chỉ hỗ trợ ảnh định dạng JPEG, PNG hoặc WebP');
    }

    if (file.size > MAX_AVATAR_BYTES || file.buffer.length > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Kích thước ảnh không được vượt quá 5 MB');
    }

    const imageHash = createHash('sha256').update(file.buffer).digest('hex');
    const avatarUrl = await this.visionStorage.luuAnh(imageHash, file);

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    return { avatarUrl };
  }
}
