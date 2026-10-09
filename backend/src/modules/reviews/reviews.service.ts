import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CardState, Prisma, SchedulerSource } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { tinhLich, tinhTrangThaiSau } from './simple-scheduler';
import { AiSchedulerClient } from './ai-scheduler.client';
import { KetQuaLapLich } from './ai-scheduler.types';

const CLAMP_DURATION_MS = 60_000;
const TRAN_ELAPSED_NGAY = 1095;
const MOT_NGAY_MS = 24 * 60 * 60 * 1000;
const CUA_SO_GUI_TRUNG_MS = 10_000;
/** Bước học lại trong phiên, giữ nguyên dù AI chỉ trả khoảng tính bằng ngày */
const KHOANG_HOC_LAI_NGAY = 10 / 1440;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClient: AiSchedulerClient,
  ) {}
  /** Gọi dịch vụ AI, hỏng thì rơi về công thức dự phòng. Luôn trả về kết quả dùng được. */
  private async lapLich(
    card: { id: string; state: CardState; difficulty: number | null; stability: number | null },
    rating: number,
    scheduledDays: number | null,
    elapsedDays: number | null,
    moc: Date,
  ): Promise<KetQuaLapLich> {
    // Hợp đồng bắt S và D phải cùng có hoặc cùng vắng, gửi lệch là 422
    const coDuDS = card.difficulty !== null && card.stability !== null;

    const phanHoi = await this.aiClient.duBao([
      {
        card_id: card.id,
        stability: coDuDS ? card.stability : null,
        difficulty: coDuDS ? card.difficulty : null,
        elapsed_days: elapsedDays ?? 0,
        rating,
      },
    ]);

    const ketQua = phanHoi?.results?.[0];

    if (!ketQua) {
      const lich = tinhLich(card.state, rating, scheduledDays, moc);
      return {
        ...lich,
        difficultyAfter: card.difficulty,
        stabilityAfter: card.stability,
        predictedRetrievability: null,
        scheduler: SchedulerSource.FALLBACK_TS,
        modelVersion: null,
      };
    }

    const laQuen = rating === 1;

    // Dịch vụ AI chỉ trả khoảng tính bằng ngày, nhỏ nhất là 1. Nhưng UC009 luồng 6a
    // bắt thẻ "Chưa nhớ" quay lại ngay trong phiên, nên backend giữ bước 10 phút.
    const nextIntervalDays = laQuen ? KHOANG_HOC_LAI_NGAY : ketQua.interval_days;

    return {
      stateAfter: tinhTrangThaiSau(card.state, rating),
      nextIntervalDays,
      dueAt: new Date(moc.getTime() + nextIntervalDays * MOT_NGAY_MS),
      laQuen,
      difficultyAfter: ketQua.new_difficulty,
      stabilityAfter: ketQua.new_stability,
      predictedRetrievability: ketQua.retrievability,
      scheduler: SchedulerSource.FSRS_AI,
      modelVersion: phanHoi.model_version,
    };
  }
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

    const lich = await this.lapLich(card, dto.rating, scheduledDays, elapsedDays, moc);

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
            predictedRetrievability: lich.predictedRetrievability,
            stateAfter: lich.stateAfter,
            difficultyAfter: lich.difficultyAfter,
            stabilityAfter: lich.stabilityAfter,
            nextIntervalDays: lich.nextIntervalDays,
            scheduler: lich.scheduler,
            modelVersion: lich.modelVersion,
          },
        });

        const theSauCapNhat = await tx.userCard.update({
          where: { id: card.id },
          data: {
            difficulty: lich.difficultyAfter,
            stability: lich.stabilityAfter,
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
