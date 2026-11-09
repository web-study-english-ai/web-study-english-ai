import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AuthProvider, Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@/prisma/prisma.service';
import {
  AdminListReadingDto,
  AdminListUsersDto,
  AdminListWordsDto,
  AdminUpdateReadingDto,
  AdminUpdateUserDto,
  AdminUpdateWordDto,
} from './dto/admin.dto';

@Injectable()
export class AdminService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      const adminEmail = 'admin@gmail.com';
      const passwordHash = await bcrypt.hash('Admin@123', 10);

      await this.prisma.user.upsert({
        where: { email: adminEmail },
        update: {
          fullName: 'Admin',
          passwordHash,
          role: UserRole.ADMIN,
          isActive: true,
        },
        create: {
          email: adminEmail,
          passwordHash,
          fullName: 'Admin',
          role: UserRole.ADMIN,
          provider: AuthProvider.LOCAL,
          isActive: true,
        },
      });
    } catch {
      // Bỏ qua nếu DB chưa sẵn sàng trong lúc chạy unit test
    }
  }

  // ==================== 1. QUẢN LÝ TỪ VỰNG ====================
  async listWords(query: AdminListWordsDto) {
    const { page, limit, search, topicId, cefr } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.WordWhereInput = {
      ...(cefr ? { cefr } : {}),
      ...(topicId ? { topicId } : {}),
      ...(search
        ? {
            OR: [
              { term: { contains: search, mode: 'insensitive' } },
              { meaningVi: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.word.findMany({
        where,
        select: {
          id: true,
          term: true,
          pos: true,
          ipa: true,
          meaningVi: true,
          exampleEn: true,
          cefr: true,
          rank: true,
          topic: { select: { id: true, slug: true, name: true } },
        },
        orderBy: { rank: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.word.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async updateWord(id: string, dto: AdminUpdateWordDto) {
    const existing = await this.prisma.word.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy từ vựng');
    }

    if (dto.term && dto.term.toLowerCase() !== existing.term) {
      const dup = await this.prisma.word.findUnique({
        where: { term: dto.term.toLowerCase() },
      });
      if (dup) {
        throw new ConflictException('Từ vựng này đã tồn tại trong hệ thống');
      }
    }

    return this.prisma.word.update({
      where: { id },
      data: {
        ...(dto.term !== undefined ? { term: dto.term.toLowerCase() } : {}),
        ...(dto.pos !== undefined ? { pos: dto.pos } : {}),
        ...(dto.cefr !== undefined ? { cefr: dto.cefr } : {}),
        ...(dto.ipa !== undefined ? { ipa: dto.ipa } : {}),
        ...(dto.meaningVi !== undefined ? { meaningVi: dto.meaningVi } : {}),
        ...(dto.exampleEn !== undefined ? { exampleEn: dto.exampleEn } : {}),
        ...(dto.topicId !== undefined ? { topicId: dto.topicId } : {}),
      },
      select: {
        id: true,
        term: true,
        pos: true,
        ipa: true,
        meaningVi: true,
        exampleEn: true,
        cefr: true,
        rank: true,
        topic: { select: { id: true, slug: true, name: true } },
      },
    });
  }

  async deleteWord(id: string) {
    const existing = await this.prisma.word.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy từ vựng');
    }

    await this.prisma.word.delete({ where: { id } });
    return { message: 'Đã xóa từ vựng thành công' };
  }

  // ==================== 2. QUẢN LÝ TÀI KHOẢN ====================
  async listUsers(query: AdminListUsersDto) {
    const { page, limit, search, role, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(status === 'ACTIVE'
        ? { isActive: true }
        : status === 'LOCKED'
          ? { isActive: false }
          : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async updateUser(adminId: string, targetUserId: string, dto: AdminUpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }

    if (adminId === targetUserId && dto.isActive === false) {
      throw new BadRequestException('Bạn không thể tự khóa tài khoản của chính mình');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (dto.isActive === false) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return updated;
  }

  // ==================== 3. QUẢN LÝ BÀI ĐỌC HIỂU ====================
  async listReadingTopics() {
    const rows = await this.prisma.readingPassage.findMany({
      distinct: ['topic'],
      select: { topic: true },
      orderBy: { topic: 'asc' },
    });
    return rows.map((r) => r.topic);
  }

  async listReading(query: AdminListReadingDto) {
    const { page, limit, search, topic, cefr } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ReadingPassageWhereInput = {
      ...(cefr ? { cefr } : {}),
      ...(topic ? { topic } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { summary: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.readingPassage.findMany({
        where,
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          content: true,
          topic: true,
          cefr: true,
          estimatedMinutes: true,
          sortOrder: true,
          createdAt: true,
          _count: { select: { questions: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.readingPassage.count({ where }),
    ]);

    const items = rows.map((r, index) => {
      const stt = skip + index + 1;
      const wordCount = r.content.trim().split(/\s+/).filter(Boolean).length;
      return {
        id: r.id,
        code: `BD${String(stt).padStart(3, '0')}`,
        slug: r.slug,
        title: r.title,
        summary: r.summary,
        topic: r.topic,
        cefr: r.cefr,
        wordCount,
        estimatedMinutes: r.estimatedMinutes,
        questionCount: r._count.questions,
        createdAt: r.createdAt,
      };
    });

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async updateReading(id: string, dto: AdminUpdateReadingDto) {
    const existing = await this.prisma.readingPassage.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy bài đọc hiểu');
    }

    return this.prisma.readingPassage.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.topic !== undefined ? { topic: dto.topic } : {}),
        ...(dto.cefr !== undefined ? { cefr: dto.cefr } : {}),
        ...(dto.estimatedMinutes !== undefined ? { estimatedMinutes: dto.estimatedMinutes } : {}),
      },
    });
  }

  async deleteReading(id: string) {
    const existing = await this.prisma.readingPassage.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy bài đọc hiểu');
    }

    await this.prisma.readingPassage.delete({ where: { id } });
    return { message: 'Đã xóa bài đọc hiểu thành công' };
  }
}
