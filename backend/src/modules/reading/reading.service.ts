import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReadingAttemptStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ListReadingsDto } from './dto/list-readings.dto';

export type TrangThaiLamBai = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface TienDoBaiDoc {
  status: TrangThaiLamBai;
  answeredCount: number;
  correctCount: number | null;
  totalQuestions: number;
}

interface LuotLamBaiTomTat {
  status: ReadingAttemptStatus;
  answeredCount: number;
  correctCount: number | null;
  totalQuestions: number;
}

@Injectable()
export class ReadingService {
  constructor(private readonly prisma: PrismaService) {}

  async listReadings(userId: string, query: ListReadingsDto) {
    const { page, limit, search, cefr, topic, status, sort } = query;

    const where: Prisma.ReadingPassageWhereInput = {
      ...(cefr ? { cefr } : {}),
      ...(topic ? { topic: { equals: topic, mode: 'insensitive' } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { summary: { contains: search, mode: 'insensitive' } },
              { content: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...this.dieuKienTrangThai(userId, status),
    };

    const orderBy = this.sapXepBaiDoc(sort);

    const [passages, total, topicRows] = await this.prisma.$transaction([
      this.prisma.readingPassage.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          topic: true,
          cefr: true,
          estimatedMinutes: true,
          _count: {
            select: { questions: true },
          },
          attempts: {
            where: { userId },
            orderBy: { updatedAt: 'desc' },
            take: 5,
            select: {
              status: true,
              answeredCount: true,
              correctCount: true,
              totalQuestions: true,
            },
          },
        },
      }),
      this.prisma.readingPassage.count({ where }),
      this.prisma.readingPassage.findMany({
        distinct: ['topic'],
        select: { topic: true },
        orderBy: { topic: 'asc' },
      }),
    ]);

    const items = passages.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      topic: p.topic,
      cefr: p.cefr,
      estimatedMinutes: p.estimatedMinutes,
      questionCount: p._count.questions,
      userProgress: this.tinhTienDoBaiDoc(p.attempts, p._count.questions),
    }));

    return {
      items,
      topics: topicRows.map((r) => r.topic),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Lấy chi tiết bài đọc và danh sách câu hỏi (hỗ trợ tìm theo id hoặc slug).
   * Tuyệt đối không trả về correctOptionIndex và explanation để tránh lộ đáp án trước khi nộp.
   */
  async getReadingById(userId: string, idOrSlug: string) {
    const passage = await this.prisma.readingPassage.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        content: true,
        topic: true,
        cefr: true,
        estimatedMinutes: true,
        questions: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            orderIndex: true,
            questionText: true,
            options: true,
          },
        },
        attempts: {
          where: {
            userId,
            status: ReadingAttemptStatus.IN_PROGRESS,
          },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            durationSeconds: true,
            answers: true,
          },
        },
      },
    });

    if (!passage) {
      throw new NotFoundException('Không tìm thấy bài đọc');
    }

    const banNhap = passage.attempts[0] ?? null;

    return {
      id: passage.id,
      slug: passage.slug,
      title: passage.title,
      summary: passage.summary,
      content: passage.content,
      topic: passage.topic,
      cefr: passage.cefr,
      estimatedMinutes: passage.estimatedMinutes,
      questions: passage.questions,
      draftAttempt: banNhap
        ? {
            id: banNhap.id,
            durationSeconds: banNhap.durationSeconds,
            answers: Array.isArray(banNhap.answers) ? banNhap.answers : [],
          }
        : null,
    };
  }

  private dieuKienTrangThai(
    userId: string,
    status?: TrangThaiLamBai,
  ): Prisma.ReadingPassageWhereInput {
    if (!status) return {};
    if (status === 'NOT_STARTED') {
      return { attempts: { none: { userId } } };
    }
    if (status === 'IN_PROGRESS') {
      return {
        attempts: {
          some: { userId, status: ReadingAttemptStatus.IN_PROGRESS },
        },
      };
    }
    return {
      attempts: {
        some: { userId, status: ReadingAttemptStatus.COMPLETED },
        none: { userId, status: ReadingAttemptStatus.IN_PROGRESS },
      },
    };
  }

  private sapXepBaiDoc(
    sort: ListReadingsDto['sort'],
  ): Prisma.ReadingPassageOrderByWithRelationInput[] {
    if (sort === 'level_asc') {
      return [{ cefr: 'asc' }, { sortOrder: 'asc' }];
    }
    if (sort === 'level_desc') {
      return [{ cefr: 'desc' }, { sortOrder: 'asc' }];
    }
    if (sort === 'newest') {
      return [{ createdAt: 'desc' }];
    }
    return [{ sortOrder: 'asc' }, { cefr: 'asc' }, { createdAt: 'asc' }];
  }

  private tinhTienDoBaiDoc(attempts: LuotLamBaiTomTat[], questionCount: number): TienDoBaiDoc {
    const dangLam = attempts.find((a) => a.status === ReadingAttemptStatus.IN_PROGRESS);
    if (dangLam) {
      return {
        status: 'IN_PROGRESS',
        answeredCount: dangLam.answeredCount,
        correctCount: null,
        totalQuestions: questionCount,
      };
    }

    const daHoanThanh = attempts.find((a) => a.status === ReadingAttemptStatus.COMPLETED);
    if (daHoanThanh) {
      return {
        status: 'COMPLETED',
        answeredCount: daHoanThanh.answeredCount,
        correctCount: daHoanThanh.correctCount,
        totalQuestions: daHoanThanh.totalQuestions || questionCount,
      };
    }

    return {
      status: 'NOT_STARTED',
      answeredCount: 0,
      correctCount: null,
      totalQuestions: questionCount,
    };
  }
}
