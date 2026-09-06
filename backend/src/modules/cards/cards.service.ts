import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CardState, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AddCardsDto } from './dto/add-cards.dto';
import { ListCardsDto } from './dto/list-cards.dto';
import { ListDueCardsDto } from './dto/list-due-cards.dto';

const cardSelect = {
  id: true,
  state: true,
  dueAt: true,
  createdAt: true,
  word: {
    select: {
      id: true,
      term: true,
      cefr: true,
      pos: true,
      ipa: true,
      meaningVi: true,
      exampleEn: true,
      topic: { select: { id: true, slug: true, name: true } },
    },
  },
} as const;

@Injectable()
export class CardsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Mốc 00:00 hôm nay theo giờ Việt Nam, quy về UTC để so với cột timestamp */
  private startOfTodayVn(now = new Date()): Date {
    const offset = 7 * 60 * 60 * 1000;
    const vnNow = new Date(now.getTime() + offset);
    const midnight = Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate());
    return new Date(midnight - offset);
  }

  async addCards(userId: string, dto: AddCardsDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { newWordsPerDay: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    // 1. Chỉ nhận wordId có thật
    const words = await this.prisma.word.findMany({
      where: { id: { in: dto.wordIds } },
      select: { id: true },
    });
    const validWordIds = words.map((w) => w.id);
    if (validWordIds.length === 0) {
      throw new NotFoundException('Không tìm thấy từ vựng nào trong danh sách đã chọn');
    }

    // 2. Loại từ đã có trong bộ thẻ
    const existing = await this.prisma.userCard.findMany({
      where: { userId, wordId: { in: validWordIds } },
      select: { wordId: true },
    });
    const existingIds = new Set(existing.map((c) => c.wordId));
    const toCreate = validWordIds.filter((id) => !existingIds.has(id));

    // 3. Đối chiếu hạn mức từ mới trong ngày
    const addedToday = await this.prisma.userCard.count({
      where: { userId, createdAt: { gte: this.startOfTodayVn() } },
    });
    const remaining = Math.max(user.newWordsPerDay - addedToday, 0);
    const exceeded = toCreate.length > remaining;

    if (exceeded && !dto.force) {
      throw new ConflictException({
        code: 'DAILY_NEW_WORD_LIMIT_EXCEEDED',
        message: `Bạn đã thêm ${addedToday}/${user.newWordsPerDay} từ mới hôm nay. Thêm ${toCreate.length} từ nữa sẽ vượt hạn mức.`,
        dailyLimit: user.newWordsPerDay,
        addedToday,
        remaining,
        requested: toCreate.length,
      });
    }

    // 4. Tạo thẻ ở trạng thái chưa học
    const result = await this.prisma.userCard.createMany({
      data: toCreate.map((wordId) => ({ userId, wordId, state: CardState.NEW })),
      skipDuplicates: true,
    });

    const newCount = await this.prisma.userCard.count({
      where: { userId, state: CardState.NEW },
    });

    return {
      added: result.count,
      skippedExisting: validWordIds.length - toCreate.length,
      notFound: dto.wordIds.length - validWordIds.length,
      exceededLimit: exceeded,
      newCardCount: newCount,
      message: `Đã thêm ${result.count} từ vào bộ thẻ`,
    };
  }

  async listCards(userId: string, query: ListCardsDto) {
    const { page, limit, state } = query;
    const where: Prisma.UserCardWhereInput = { userId, ...(state ? { state } : {}) };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.userCard.findMany({
        where,
        select: cardSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.userCard.count({ where }),
    ]);

    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
  }

  async listNewCards(userId: string, limit?: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { newWordsPerDay: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    const take = Math.min(limit ?? user.newWordsPerDay, user.newWordsPerDay);

    const items = await this.prisma.userCard.findMany({
      where: { userId, state: CardState.NEW },
      select: cardSelect,
      orderBy: { createdAt: 'asc' },
      take,
    });

    return { items, dailyLimit: user.newWordsPerDay, count: items.length };
  }

  async listDueCards(userId: string, query: ListDueCardsDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { maxReviewsPerDay: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    const now = new Date();

    const dueWhere: Prisma.UserCardWhereInput = {
      userId,
      state: { in: [CardState.LEARNING, CardState.REVIEW, CardState.RELEARNING] },
      dueAt: { lte: now },
    };

    const [totalDue, reviewedToday] = await this.prisma.$transaction([
      this.prisma.userCard.count({ where: dueWhere }),
      this.prisma.userCard.count({
        where: { userId, lastReviewedAt: { gte: this.startOfTodayVn(now) } },
      }),
    ]);

    const remaining = Math.max(user.maxReviewsPerDay - reviewedToday, 0);
    const take = Math.min(query.limit ?? remaining, remaining);

    const items =
      take === 0
        ? []
        : await this.prisma.userCard.findMany({
            where: dueWhere,
            select: cardSelect,
            orderBy: [{ dueAt: 'asc' }, { stability: { sort: 'asc', nulls: 'first' } }],
            take,
          });

    return {
      items,
      meta: {
        totalDue,
        reviewedToday,
        sessionTotal: totalDue + reviewedToday,
        dailyLimit: user.maxReviewsPerDay,
        remaining,
        returned: items.length,
      },
    };
  }

  async removeCard(userId: string, cardId: string) {
    const card = await this.prisma.userCard.findUnique({
      where: { id: cardId },
      select: { id: true, userId: true },
    });
    if (!card || card.userId !== userId) throw new NotFoundException('Không tìm thấy thẻ');

    await this.prisma.userCard.delete({ where: { id: cardId } });
    return { message: 'Đã bỏ từ khỏi bộ thẻ' };
  }
}
