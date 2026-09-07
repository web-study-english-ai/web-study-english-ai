import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ReviewsService } from './reviews.service';

const txMock = {
  review: { create: vi.fn() },
  userCard: { update: vi.fn() },
};

const prismaMock = {
  userCard: { findUnique: vi.fn(), update: vi.fn() },
  review: { findFirst: vi.fn(), findUnique: vi.fn() },
  $transaction: vi.fn((cb: any) => cb(txMock)),
};

const USER_ID = 'user-1';
const CARD_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const WORD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const BAY_GIO = new Date('2026-09-07T10:00:00.000Z');

const TRUONG_BAT_BUOC = [
  'userId',
  'cardId',
  'wordId',
  'reviewedAt',
  'reviewTh',
  'rating',
  'elapsedDays',
  'scheduledDays',
  'durationMs',
  'stateBefore',
  'difficultyBefore',
  'stabilityBefore',
  'predictedRetrievability',
  'stateAfter',
  'difficultyAfter',
  'stabilityAfter',
  'nextIntervalDays',
  'scheduler',
  'modelVersion',
].sort();

const theDangOn = {
  id: CARD_ID,
  userId: USER_ID,
  wordId: WORD_ID,
  state: 'REVIEW' as const,
  reps: 3,
  lapses: 1,
  difficulty: 0.45,
  stability: 3.2,
  dueAt: new Date('2026-09-06T10:00:00.000Z'),
  lastReviewedAt: new Date('2026-09-05T10:00:00.000Z'),
};

const duLieuGhi = () => txMock.review.create.mock.calls[0][0].data;

describe('ReviewsService', () => {
  let service: ReviewsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(BAY_GIO);

    prismaMock.userCard.findUnique.mockResolvedValue(theDangOn);
    prismaMock.review.findFirst.mockResolvedValue({
      id: 'review-truoc',
      rating: 2,
      reviewedAt: new Date('2026-09-03T10:00:00.000Z'),
      nextIntervalDays: 4,
    });
    txMock.review.create.mockResolvedValue({ id: 'review-1' });
    txMock.userCard.update.mockResolvedValue({ id: CARD_ID });

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  afterEach(() => vi.useRealTimers());

  describe('ghi bản ghi nhật ký', () => {
    it('ghi đủ 19 trường, không thừa không thiếu', async () => {
      await service.createReview(USER_ID, { cardId: CARD_ID, rating: 3, durationMs: 4500 });
      expect(Object.keys(duLieuGhi()).sort()).toEqual(TRUONG_BAT_BUOC);
    });

    it('tính elapsedDays ở server từ lastReviewedAt, không lấy từ client', async () => {
      await service.createReview(USER_ID, { cardId: CARD_ID, rating: 3, durationMs: 4500 });
      expect(duLieuGhi().elapsedDays).toBe(2);
    });

    it('lượt ôn đầu tiên để elapsedDays và scheduledDays là null', async () => {
      prismaMock.userCard.findUnique.mockResolvedValue({
        ...theDangOn,
        state: 'NEW',
        reps: 0,
        lastReviewedAt: null,
        difficulty: null,
        stability: null,
        dueAt: null,
      });
      prismaMock.review.findFirst.mockResolvedValue(null);

      await service.createReview(USER_ID, { cardId: CARD_ID, rating: 3, durationMs: 4500 });

      expect(duLieuGhi().elapsedDays).toBeNull();
      expect(duLieuGhi().scheduledDays).toBeNull();
      expect(duLieuGhi().reviewTh).toBe(1);
    });

    it('scheduledDays lấy từ khoảng hẹn của lượt trước, reviewTh nối tiếp reps', async () => {
      await service.createReview(USER_ID, { cardId: CARD_ID, rating: 3, durationMs: 4500 });
      expect(duLieuGhi().scheduledDays).toBe(4);
      expect(duLieuGhi().reviewTh).toBe(4);
    });

    it('kẹp durationMs ở 60 giây', async () => {
      await service.createReview(USER_ID, { cardId: CARD_ID, rating: 3, durationMs: 200_000 });
      expect(duLieuGhi().durationMs).toBe(60_000);
    });

    it('đợt 4 chưa có dịch vụ AI nên đánh dấu FALLBACK_TS và để trống D/S/R', async () => {
      await service.createReview(USER_ID, { cardId: CARD_ID, rating: 3, durationMs: 4500 });
      expect(duLieuGhi().scheduler).toBe('FALLBACK_TS');
      expect(duLieuGhi().modelVersion).toBeNull();
      expect(duLieuGhi().predictedRetrievability).toBeNull();
    });

    it('không nhận thời điểm ôn ở tương lai do client gửi', async () => {
      await service.createReview(USER_ID, {
        cardId: CARD_ID,
        rating: 3,
        durationMs: 4500,
        reviewedAt: '2026-12-31T00:00:00.000Z',
      });
      expect(duLieuGhi().reviewedAt).toEqual(BAY_GIO);
    });
  });

  describe('cập nhật thẻ', () => {
    it('cập nhật trạng thái, hạn ôn và số lượt trong cùng giao dịch', async () => {
      await service.createReview(USER_ID, { cardId: CARD_ID, rating: 3, durationMs: 4500 });

      const data = txMock.userCard.update.mock.calls[0][0].data;
      expect(data.state).toBe('REVIEW');
      expect(data.reps).toEqual({ increment: 1 });
      expect(data.lastReviewedAt).toEqual(BAY_GIO);
      expect(data.dueAt).toEqual(new Date('2026-09-17T10:00:00.000Z'));
      expect(data.lapses).toBeUndefined();
    });

    it('chỉ tăng lapses khi người học trả lời Chưa nhớ', async () => {
      await service.createReview(USER_ID, { cardId: CARD_ID, rating: 1, durationMs: 4500 });

      const data = txMock.userCard.update.mock.calls[0][0].data;
      expect(data.lapses).toEqual({ increment: 1 });
      expect(data.state).toBe('RELEARNING');
    });
  });

  describe('gửi lại sau khi đã ghi xong', () => {
    const luotVuaGhi = {
      id: 'review-vua-ghi',
      rating: 3,
      reviewedAt: new Date('2026-09-07T09:59:56.000Z'),
      nextIntervalDays: 10,
    };

    it('cùng thẻ, cùng mức đánh giá, trong 10 giây thì trả bản cũ và không ghi thêm', async () => {
      prismaMock.review.findFirst.mockResolvedValue(luotVuaGhi);

      const kq = await service.createReview(USER_ID, {
        cardId: CARD_ID,
        rating: 3,
        durationMs: 4500,
      });

      expect(kq.trungLap).toBe(true);
      expect(kq.review).toMatchObject({ id: 'review-vua-ghi' });
      expect(txMock.review.create).not.toHaveBeenCalled();
      expect(txMock.userCard.update).not.toHaveBeenCalled();
    });

    it('quá 10 giây thì coi là lượt ôn thật, vẫn ghi', async () => {
      prismaMock.review.findFirst.mockResolvedValue({
        ...luotVuaGhi,
        reviewedAt: new Date('2026-09-07T09:59:45.000Z'),
      });

      const kq = await service.createReview(USER_ID, {
        cardId: CARD_ID,
        rating: 3,
        durationMs: 4500,
      });

      expect(kq.trungLap).toBe(false);
      expect(txMock.review.create).toHaveBeenCalled();
    });

    it('trong 10 giây nhưng đổi mức đánh giá thì vẫn ghi thành lượt mới', async () => {
      prismaMock.review.findFirst.mockResolvedValue(luotVuaGhi);

      const kq = await service.createReview(USER_ID, {
        cardId: CARD_ID,
        rating: 4,
        durationMs: 4500,
      });

      expect(kq.trungLap).toBe(false);
      expect(txMock.review.create).toHaveBeenCalled();
    });
  });

  describe('hai request song song', () => {
    const loiP2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
    });

    it('cùng mức đánh giá thì trả lại bản ghi cũ, không phải lỗi', async () => {
      txMock.review.create.mockRejectedValue(loiP2002);
      prismaMock.review.findUnique.mockResolvedValue({ id: 'review-cu', rating: 3 });
      prismaMock.userCard.findUnique
        .mockResolvedValueOnce(theDangOn)
        .mockResolvedValueOnce({ id: CARD_ID, state: 'REVIEW' });

      const kq = await service.createReview(USER_ID, {
        cardId: CARD_ID,
        rating: 3,
        durationMs: 4500,
      });

      expect(kq.trungLap).toBe(true);
      expect(kq.review).toMatchObject({ id: 'review-cu' });
    });

    it('khác mức đánh giá thì báo xung đột', async () => {
      txMock.review.create.mockRejectedValue(loiP2002);
      prismaMock.review.findUnique.mockResolvedValue({ id: 'review-cu', rating: 1 });

      await expect(
        service.createReview(USER_ID, { cardId: CARD_ID, rating: 3, durationMs: 4500 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  it('không cho ghi lượt ôn lên thẻ của người khác', async () => {
    prismaMock.userCard.findUnique.mockResolvedValue({ ...theDangOn, userId: 'user-khac' });

    await expect(
      service.createReview(USER_ID, { cardId: CARD_ID, rating: 3, durationMs: 4500 }),
    ).rejects.toThrow(NotFoundException);

    expect(txMock.review.create).not.toHaveBeenCalled();
  });
});
