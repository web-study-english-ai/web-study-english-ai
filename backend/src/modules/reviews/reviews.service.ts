import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SchedulerSource } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { tinhLich } from './simple-scheduler';

const CLAMP_DURATION_MS = 60_000;
const TRAN_ELAPSED_NGAY = 1095;
const MOT_NGAY_MS = 24 * 60 * 60 * 1000;
const CUA_SO_GUI_TRUNG_MS = 10_000;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Chỉ nhận thời điểm trong 24 giờ gần nhất và không ở tương lai */
  private mocOnTap(gui?: string): Date {
    const bayGio = new Date();
    if (!gui) return bayGio;
    const guiMs = new Date(gui).getTime();
    if (Number.isNaN(guiMs)) return bayGio;
    const somNhat = bayGio.getTime() - MOT_NGAY_MS;
    return new Date(Math.min(Math.max(guiMs, somNhat), bayGio.getTime()));
  }

  async createReview(userId: string, dto: CreateReviewDto) {
    const card = await this.prisma.userCard.findUnique({
      where: { id: dto.cardId },
      select: {
        id: true,
        userId: true,
        wordId: true,
        state: true,
        reps: true,
        difficulty: true,
        stability: true,
        lastReviewedAt: true,
        dueAt: true,
        lapses: true,
      },
    });
    if (!card || card.userId !== userId) throw new NotFoundException('Không tìm thấy thẻ');

    const moc = this.mocOnTap(dto.reviewedAt);
    const reviewTh = card.reps + 1;

    const luotTruoc = await this.prisma.review.findFirst({
      where: { cardId: card.id },
      orderBy: { reviewTh: 'desc' },
      select: { id: true, rating: true, reviewedAt: true, nextIntervalDays: true },
    });
    const scheduledDays = luotTruoc?.nextIntervalDays ?? null;

    // Gửi lại sau khi lượt đầu đã ghi xong: ràng buộc unique không bắt được
    // vì reps đã tăng, nên chặn bằng cửa sổ thời gian.
    if (
      luotTruoc &&
      luotTruoc.rating === dto.rating &&
      moc.getTime() - luotTruoc.reviewedAt.getTime() <= CUA_SO_GUI_TRUNG_MS
    ) {
      return {
        review: luotTruoc,
        card: {
          id: card.id,
          state: card.state,
          dueAt: card.dueAt,
          reps: card.reps,
          lapses: card.lapses,
        },
        trungLap: true,
      };
    }

    const elapsedDays = card.lastReviewedAt
      ? Math.min(
          Math.max((moc.getTime() - card.lastReviewedAt.getTime()) / MOT_NGAY_MS, 0),
          TRAN_ELAPSED_NGAY,
        )
      : null;

    const lich = tinhLich(card.state, dto.rating, scheduledDays, moc);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: {
            userId,
            cardId: card.id,
            wordId: card.wordId,
            reviewedAt: moc,
            reviewTh,
            rating: dto.rating,
            elapsedDays,
            scheduledDays,
            durationMs: Math.min(dto.durationMs, CLAMP_DURATION_MS),
            stateBefore: card.state,
            difficultyBefore: card.difficulty,
            stabilityBefore: card.stability,
            predictedRetrievability: null,
            stateAfter: lich.stateAfter,
            difficultyAfter: card.difficulty,
            stabilityAfter: card.stability,
            nextIntervalDays: lich.nextIntervalDays,
            scheduler: SchedulerSource.FALLBACK_TS,
            modelVersion: null,
          },
        });

        const theSauCapNhat = await tx.userCard.update({
          where: { id: card.id },
          data: {
            state: lich.stateAfter,
            reps: { increment: 1 },
            ...(lich.laQuen ? { lapses: { increment: 1 } } : {}),
            dueAt: lich.dueAt,
            lastReviewedAt: moc,
          },
          select: { id: true, state: true, dueAt: true, reps: true, lapses: true },
        });

        return { review, card: theSauCapNhat, trungLap: false };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.xuLyGuiTrung(card.id, reviewTh, dto.rating);
      }
      throw e;
    }
  }

  private async xuLyGuiTrung(cardId: string, reviewTh: number, rating: number) {
    const daCo = await this.prisma.review.findUnique({
      where: { cardId_reviewTh: { cardId, reviewTh } },
    });
    if (!daCo) throw new ConflictException('Xung đột khi ghi lượt ôn, thử lại');

    if (daCo.rating !== rating) {
      throw new ConflictException({
        code: 'REVIEW_TH_CONFLICT',
        message: `Lượt ôn thứ ${reviewTh} của thẻ này đã được ghi với mức đánh giá khác`,
      });
    }

    const card = await this.prisma.userCard.findUnique({
      where: { id: cardId },
      select: { id: true, state: true, dueAt: true, reps: true, lapses: true },
    });
    return { review: daCo, card, trungLap: true };
  }
}
