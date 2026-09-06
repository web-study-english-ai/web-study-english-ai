import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { CardsService } from './cards.service';

const prismaMock = {
  user: { findUnique: vi.fn() },
  word: { findMany: vi.fn() },
  userCard: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    createMany: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn(),
};

const USER_ID = 'user-1';
const W1 = '11111111-1111-1111-1111-111111111111';
const W2 = '22222222-2222-2222-2222-222222222222';

describe('CardsService', () => {
  let service: CardsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ newWordsPerDay: 20, maxReviewsPerDay: 50 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [CardsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<CardsService>(CardsService);
  });

  describe('addCards', () => {
    it('tạo thẻ mới ở trạng thái NEW', async () => {
      prismaMock.word.findMany.mockResolvedValue([{ id: W1 }, { id: W2 }]);
      prismaMock.userCard.findMany.mockResolvedValue([]);
      prismaMock.userCard.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
      prismaMock.userCard.createMany.mockResolvedValue({ count: 2 });

      const result = await service.addCards(USER_ID, { wordIds: [W1, W2], force: false });

      expect(result.added).toBe(2);
      expect(prismaMock.userCard.createMany).toHaveBeenCalledWith({
        data: [
          { userId: USER_ID, wordId: W1, state: 'NEW' },
          { userId: USER_ID, wordId: W2, state: 'NEW' },
        ],
        skipDuplicates: true,
      });
    });

    it('bỏ qua từ đã có trong bộ thẻ, không tạo bản ghi trùng', async () => {
      prismaMock.word.findMany.mockResolvedValue([{ id: W1 }, { id: W2 }]);
      prismaMock.userCard.findMany.mockResolvedValue([{ wordId: W1 }]);
      prismaMock.userCard.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      prismaMock.userCard.createMany.mockResolvedValue({ count: 1 });

      const result = await service.addCards(USER_ID, { wordIds: [W1, W2], force: false });

      expect(result.skippedExisting).toBe(1);
      expect(prismaMock.userCard.createMany.mock.calls[0][0].data).toEqual([
        { userId: USER_ID, wordId: W2, state: 'NEW' },
      ]);
    });

    it('ném ConflictException khi vượt hạn mức và không có force', async () => {
      prismaMock.word.findMany.mockResolvedValue([{ id: W1 }, { id: W2 }]);
      prismaMock.userCard.findMany.mockResolvedValue([]);
      prismaMock.userCard.count.mockResolvedValueOnce(19); // đã thêm 19/20 hôm nay

      await expect(service.addCards(USER_ID, { wordIds: [W1, W2], force: false })).rejects.toThrow(
        ConflictException,
      );

      expect(prismaMock.userCard.createMany).not.toHaveBeenCalled();
    });

    it('vẫn thêm khi vượt hạn mức nhưng force = true', async () => {
      prismaMock.word.findMany.mockResolvedValue([{ id: W1 }, { id: W2 }]);
      prismaMock.userCard.findMany.mockResolvedValue([]);
      prismaMock.userCard.count.mockResolvedValueOnce(19).mockResolvedValueOnce(21);
      prismaMock.userCard.createMany.mockResolvedValue({ count: 2 });

      const result = await service.addCards(USER_ID, { wordIds: [W1, W2], force: true });

      expect(result.added).toBe(2);
      expect(result.exceededLimit).toBe(true);
    });

    it('ném NotFoundException khi không có wordId nào hợp lệ', async () => {
      prismaMock.word.findMany.mockResolvedValue([]);

      await expect(service.addCards(USER_ID, { wordIds: [W1], force: false })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listCards', () => {
    it('chỉ lấy thẻ của đúng người dùng', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      await service.listCards(USER_ID, { page: 1, limit: 20 });

      expect(prismaMock.userCard.findMany.mock.calls[0][0].where).toEqual({ userId: USER_ID });
    });
  });

  describe('listNewCards', () => {
    it('không lấy quá hạn mức từ mới mỗi ngày', async () => {
      prismaMock.userCard.findMany.mockResolvedValue([]);

      await service.listNewCards(USER_ID, 500);

      expect(prismaMock.userCard.findMany.mock.calls[0][0].take).toBe(20);
    });

    it('chỉ lấy thẻ trạng thái NEW của đúng người dùng', async () => {
      prismaMock.userCard.findMany.mockResolvedValue([]);

      await service.listNewCards(USER_ID);

      expect(prismaMock.userCard.findMany.mock.calls[0][0].where).toEqual({
        userId: USER_ID,
        state: 'NEW',
      });
    });
  });

  describe('listDueCards', () => {
    it('chỉ lấy thẻ đến hạn của đúng người dùng, loại thẻ NEW', async () => {
      prismaMock.$transaction.mockResolvedValue([15, 5]);
      prismaMock.userCard.findMany.mockResolvedValue([]);

      await service.listDueCards(USER_ID, {});

      const where = prismaMock.userCard.findMany.mock.calls[0][0].where;
      expect(where.userId).toBe(USER_ID);
      expect(where.state).toEqual({ in: ['LEARNING', 'REVIEW', 'RELEARNING'] });
      expect(where.dueAt.lte).toBeInstanceOf(Date);
    });

    it('trừ số thẻ đã ôn hôm nay khỏi hạn mức', async () => {
      prismaMock.$transaction.mockResolvedValue([100, 45]); // 100 đến hạn, đã ôn 45/50
      prismaMock.userCard.findMany.mockResolvedValue([]);

      const result = await service.listDueCards(USER_ID, {});

      expect(prismaMock.userCard.findMany.mock.calls[0][0].take).toBe(5);
      expect(result.meta.remaining).toBe(5);
      expect(result.meta.sessionTotal).toBe(145);
    });

    it('hết hạn mức thì trả rỗng, không truy vấn danh sách', async () => {
      prismaMock.$transaction.mockResolvedValue([30, 50]);

      const result = await service.listDueCards(USER_ID, {});

      expect(result.items).toEqual([]);
      expect(prismaMock.userCard.findMany).not.toHaveBeenCalled();
    });

    it('không cho xin quá hạn mức còn lại', async () => {
      prismaMock.$transaction.mockResolvedValue([100, 0]);
      prismaMock.userCard.findMany.mockResolvedValue([]);

      await service.listDueCards(USER_ID, { limit: 100 });

      expect(prismaMock.userCard.findMany.mock.calls[0][0].take).toBe(50);
    });
  });

  describe('removeCard', () => {
    it('không cho xoá thẻ của người khác', async () => {
      prismaMock.userCard.findUnique.mockResolvedValue({ id: 'c1', userId: 'user-khac' });

      await expect(service.removeCard(USER_ID, 'c1')).rejects.toThrow(NotFoundException);
      expect(prismaMock.userCard.delete).not.toHaveBeenCalled();
    });
  });
});
