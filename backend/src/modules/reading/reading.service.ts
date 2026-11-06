import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReadingAttemptStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AttemptReadingDto } from './dto/attempt-reading.dto';
import { ListReadingsDto } from './dto/list-readings.dto';

export type TrangThaiLamBai = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface TienDoBaiDoc {
  status: TrangThaiLamBai;
  answeredCount: number;
  correctCount: number | null;
  totalQuestions: number;
  durationSeconds: number | null;
}

interface LuotLamBaiTomTat {
  status: ReadingAttemptStatus;
  answeredCount: number;
  correctCount: number | null;
  totalQuestions: number;
  durationSeconds: number;
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
              durationSeconds: true,
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

  /**
   * Lưu tiến độ làm bài đọc hiểu đang dở (IN_PROGRESS).
   * Nếu đã có bản nháp IN_PROGRESS của bài đọc này thì cập nhật, chưa có thì tạo mới.
   */
  async saveDraft(userId: string, idOrSlug: string, dto: AttemptReadingDto) {
    const passage = await this.prisma.readingPassage.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      select: {
        id: true,
        questions: {
          orderBy: { orderIndex: 'asc' },
          select: { id: true, options: true },
        },
      },
    });

    if (!passage) {
      throw new NotFoundException('Không tìm thấy bài đọc');
    }

    const banDoCauHoi = new Map(passage.questions.map((q) => [q.id, q.options.length]));
    const banDoLuaChon = new Map<string, number>();

    for (const item of dto.answers) {
      const soLuaChon = banDoCauHoi.get(item.questionId);
      if (
        soLuaChon !== undefined &&
        item.selectedOptionIndex >= 0 &&
        item.selectedOptionIndex < soLuaChon
      ) {
        banDoLuaChon.set(item.questionId, item.selectedOptionIndex);
      }
    }

    const danhSachTraLoi = Array.from(banDoLuaChon.entries()).map(
      ([questionId, selectedOptionIndex]) => ({
        questionId,
        selectedOptionIndex,
      }),
    );

    const banNhapHienCo = await this.prisma.readingAttempt.findFirst({
      where: {
        userId,
        passageId: passage.id,
        status: ReadingAttemptStatus.IN_PROGRESS,
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    const duLieu = {
      answers: danhSachTraLoi,
      answeredCount: danhSachTraLoi.length,
      totalQuestions: passage.questions.length,
      durationSeconds: dto.durationSeconds,
    };

    const ketQua = banNhapHienCo
      ? await this.prisma.readingAttempt.update({
          where: { id: banNhapHienCo.id },
          data: duLieu,
        })
      : await this.prisma.readingAttempt.create({
          data: {
            userId,
            passageId: passage.id,
            status: ReadingAttemptStatus.IN_PROGRESS,
            ...duLieu,
          },
        });

    return {
      id: ketQua.id,
      passageId: passage.id,
      status: ketQua.status,
      answeredCount: ketQua.answeredCount,
      totalQuestions: ketQua.totalQuestions,
      durationSeconds: ketQua.durationSeconds,
      answers: danhSachTraLoi,
    };
  }

  /**
   * Nộp bài đọc hiểu, chấm điểm từng câu và lưu lịch sử hoàn thành (COMPLETED).
   */
  async submitReading(userId: string, idOrSlug: string, dto: AttemptReadingDto) {
    const passage = await this.prisma.readingPassage.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      select: {
        id: true,
        questions: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            orderIndex: true,
            questionText: true,
            options: true,
            correctOptionIndex: true,
            explanation: true,
          },
        },
      },
    });

    if (!passage) {
      throw new NotFoundException('Không tìm thấy bài đọc');
    }

    if (passage.questions.length === 0) {
      throw new BadRequestException('Bài đọc này chưa có câu hỏi để chấm điểm');
    }

    const banDoLuaChon = new Map<string, number>();
    for (const item of dto.answers) {
      banDoLuaChon.set(item.questionId, item.selectedOptionIndex);
    }

    for (const q of passage.questions) {
      const luaChon = banDoLuaChon.get(q.id);
      if (luaChon === undefined || luaChon < 0 || luaChon >= q.options.length) {
        throw new BadRequestException('Vui lòng trả lời hợp lệ tất cả câu hỏi trước khi nộp bài');
      }
    }

    let correctCount = 0;
    const results = passage.questions.map((q) => {
      const selectedOptionIndex = banDoLuaChon.get(q.id)!;
      const isCorrect = selectedOptionIndex === q.correctOptionIndex;
      if (isCorrect) correctCount++;

      return {
        questionId: q.id,
        orderIndex: q.orderIndex,
        questionText: q.questionText,
        options: q.options,
        selectedOptionIndex,
        correctOptionIndex: q.correctOptionIndex,
        isCorrect,
        explanation: q.explanation ?? '',
      };
    });

    const totalQuestions = passage.questions.length;
    const wrongCount = totalQuestions - correctCount;
    const submittedAt = new Date();
    const danhSachTraLoi = passage.questions.map((q) => ({
      questionId: q.id,
      selectedOptionIndex: banDoLuaChon.get(q.id)!,
    }));

    const [, attempt] = await this.prisma.$transaction([
      this.prisma.readingAttempt.deleteMany({
        where: {
          userId,
          passageId: passage.id,
          status: ReadingAttemptStatus.IN_PROGRESS,
        },
      }),
      this.prisma.readingAttempt.create({
        data: {
          userId,
          passageId: passage.id,
          status: ReadingAttemptStatus.COMPLETED,
          answers: danhSachTraLoi,
          answeredCount: totalQuestions,
          correctCount,
          totalQuestions,
          durationSeconds: dto.durationSeconds,
          submittedAt,
        },
      }),
    ]);

    return {
      attemptId: attempt.id,
      passageId: passage.id,
      correctCount,
      wrongCount,
      totalQuestions,
      durationSeconds: dto.durationSeconds,
      submittedAt,
      results,
    };
  }

  /**
   * Lịch sử các lượt hoàn thành bài đọc hiểu của người học (có thể lọc theo 1 bài đọc cụ thể).
   */
  async listHistory(userId: string, idOrSlug?: string) {
    let passageId: string | undefined;

    if (idOrSlug) {
      const passage = await this.prisma.readingPassage.findFirst({
        where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
        select: { id: true },
      });
      if (!passage) {
        throw new NotFoundException('Không tìm thấy bài đọc');
      }
      passageId = passage.id;
    }

    const attempts = await this.prisma.readingAttempt.findMany({
      where: {
        userId,
        status: ReadingAttemptStatus.COMPLETED,
        ...(passageId ? { passageId } : {}),
      },
      orderBy: { submittedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        passageId: true,
        correctCount: true,
        totalQuestions: true,
        durationSeconds: true,
        submittedAt: true,
        answers: true,
        passage: {
          select: {
            id: true,
            slug: true,
            title: true,
            topic: true,
            cefr: true,
          },
        },
      },
    });

    return attempts.map((a) => {
      const correctCount = a.correctCount ?? 0;
      return {
        attemptId: a.id,
        passageId: a.passageId,
        passage: a.passage,
        correctCount,
        wrongCount: Math.max(0, a.totalQuestions - correctCount),
        totalQuestions: a.totalQuestions,
        durationSeconds: a.durationSeconds,
        submittedAt: a.submittedAt,
        answers: Array.isArray(a.answers) ? a.answers : [],
      };
    });
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
    if (sort === 'level_asc' || sort === 'cefr_asc') {
      return [{ cefr: 'asc' }, { sortOrder: 'asc' }];
    }
    if (sort === 'level_desc' || sort === 'cefr_desc') {
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
        durationSeconds: dangLam.durationSeconds,
      };
    }

    const daHoanThanh = attempts.find((a) => a.status === ReadingAttemptStatus.COMPLETED);
    if (daHoanThanh) {
      return {
        status: 'COMPLETED',
        answeredCount: daHoanThanh.answeredCount,
        correctCount: daHoanThanh.correctCount,
        totalQuestions: daHoanThanh.totalQuestions || questionCount,
        durationSeconds: daHoanThanh.durationSeconds,
      };
    }

    return {
      status: 'NOT_STARTED',
      answeredCount: 0,
      correctCount: null,
      totalQuestions: questionCount,
      durationSeconds: null,
    };
  }
}
