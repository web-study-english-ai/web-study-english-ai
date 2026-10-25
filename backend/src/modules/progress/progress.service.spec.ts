import { Test, TestingModule } from '@nestjs/testing';
import { CardState } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ProgressService } from './progress.service';

describe('ProgressService', () => {
  let service: ProgressService;

  const prismaMock = {
    userCard: {
      groupBy: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    review: {
      findMany: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<ProgressService>(ProgressService);
  });

  it('nên xử lý an toàn người dùng mới toanh chưa có thẻ hay lượt ôn nào', async () => {
    prismaMock.userCard.groupBy.mockResolvedValue([]);
    prismaMock.userCard.count.mockResolvedValue(0);
    prismaMock.userCard.findMany.mockResolvedValue([]);
    prismaMock.review.findMany.mockResolvedValue([]);

    const result = await service.getStats('new-user-123');

    expect(result).toBeDefined();
    expect(result.totalWords).toBe(0);
    expect(result.weeklyGain).toBe(0);
    expect(result.statusCounts.mastered).toBe(0);
    expect(result.statusCounts.learning).toBe(0);
    expect(result.statusCounts.notLearned).toBe(0);
    expect(result.totalWordsTimeline).toHaveLength(4);
    expect(result.summary.totalWords.count).toBe(0);
    expect(result.summary.totalWords.changeVsLastWeek).toBe(0);
    expect(result.summary.streak.current).toBe(0);
    expect(result.summary.streak.studiedToday).toBe(false);
    expect(result.summary.memoryStability.score).toBe(0);
    expect(result.cardDistribution.total).toBe(0);
    expect(result.cardDistribution.mastered.percentage).toBe(0);
    expect(result.cardDistribution.learning.percentage).toBe(0);
    expect(result.cardDistribution.unlearned.percentage).toBe(0);
    expect(result.dailyActivity).toHaveLength(7);
    expect(result.stabilityTimeline).toHaveLength(4);
    expect(result.motivationalMessage).toContain('Chào mừng bạn');
  });

  it('nên tính đúng tỷ lệ nhớ, phân bố thẻ, độ bền trí nhớ và streak khi có dữ liệu (range = week)', async () => {
    const now = new Date();

    // Mock phân bố thẻ
    prismaMock.userCard.groupBy.mockResolvedValue([
      { state: CardState.REVIEW, _count: { id: 65 } },
      { state: CardState.LEARNING, _count: { id: 25 } },
      { state: CardState.NEW, _count: { id: 10 } },
    ]);

    // Mock count từ mới 7 ngày
    prismaMock.userCard.count.mockResolvedValue(12);

    // Mock reviews trong 7 ngày qua: 10 lượt, 9 lượt rating >= 3 -> 90%
    const recentReviews = [
      { rating: 4, reviewedAt: now },
      { rating: 3, reviewedAt: now },
      { rating: 3, reviewedAt: now },
      { rating: 4, reviewedAt: now },
      { rating: 4, reviewedAt: now },
      { rating: 3, reviewedAt: now },
      { rating: 3, reviewedAt: now },
      { rating: 4, reviewedAt: now },
      { rating: 3, reviewedAt: now },
      { rating: 1, reviewedAt: now },
    ];

    prismaMock.userCard.findMany
      .mockResolvedValueOnce([{ createdAt: now }]) // allCardCreatedDates
      .mockResolvedValueOnce([
        { stability: 24.0 }, // 80%
        { stability: 30.0 }, // 100%
      ]); // cardsWithStability -> avg = 90%

    prismaMock.review.findMany
      .mockResolvedValueOnce(recentReviews) // 7 days reviews
      .mockResolvedValueOnce([{ reviewedAt: now }]) // allReviewDates
      .mockResolvedValueOnce([{ stabilityAfter: 20.0 }]) // reviewsPriorWeek
      .mockResolvedValueOnce([{ reviewedAt: now, stabilityAfter: 25.0 }]); // historyReviews

    const result = await service.getStats('active-user-456', 'week');

    expect(result.totalWords).toBe(100);
    expect(result.weeklyGain).toBe(12);
    expect(result.statusCounts.mastered).toBe(65);
    expect(result.statusCounts.learning).toBe(25);
    expect(result.statusCounts.notLearned).toBe(10);
    expect(result.retentionRate7d).toBe(90);
    expect(result.streakDays).toBeGreaterThanOrEqual(1);
    expect(result.totalWordsTimeline).toHaveLength(4);

    expect(result.summary.totalWords.count).toBe(100);
    expect(result.summary.totalWords.changeVsLastWeek).toBe(12);
    expect(result.summary.retentionRate7Days.rate).toBe(90);
    expect(result.summary.retentionRate7Days.status).toBe('EXCELLENT');
    expect(result.summary.retentionRate7Days.statusText).toBe('Xuất sắc');
    expect(result.summary.streak.studiedToday).toBe(true);
    expect(result.summary.streak.current).toBeGreaterThanOrEqual(1);

    expect(result.cardDistribution.total).toBe(100);
    expect(result.cardDistribution.mastered.count).toBe(65);
    expect(result.cardDistribution.mastered.percentage).toBe(65);
    expect(result.cardDistribution.learning.count).toBe(25);
    expect(result.cardDistribution.learning.percentage).toBe(25);
    expect(result.cardDistribution.unlearned.count).toBe(10);
    expect(result.cardDistribution.unlearned.percentage).toBe(10);

    expect(result.summary.memoryStability.score).toBe(90);
    expect(result.dailyActivity).toHaveLength(7);
    expect(result.stabilityTimeline).toHaveLength(4);
  });

  it('nên hỗ trợ range = day với 14 ngày dữ liệu', async () => {
    prismaMock.userCard.groupBy.mockResolvedValue([]);
    prismaMock.userCard.count.mockResolvedValue(0);
    prismaMock.userCard.findMany.mockResolvedValue([]);
    prismaMock.review.findMany.mockResolvedValue([]);

    const result = await service.getStats('user-day', 'day');

    expect(result.stabilityTimeline).toHaveLength(14);
    expect(result.dailyActivity).toHaveLength(14);
    expect(result.totalWordsTimeline).toHaveLength(14);
  });

  it('nên hỗ trợ range = month với 6 tháng dữ liệu', async () => {
    prismaMock.userCard.groupBy.mockResolvedValue([]);
    prismaMock.userCard.count.mockResolvedValue(0);
    prismaMock.userCard.findMany.mockResolvedValue([]);
    prismaMock.review.findMany.mockResolvedValue([]);

    const result = await service.getStats('user-month', 'month');

    expect(result.stabilityTimeline).toHaveLength(6);
    expect(result.dailyActivity).toHaveLength(6);
    expect(result.totalWordsTimeline).toHaveLength(6);
    expect(result.stabilityTimeline[5].label).toMatch(/Thg \d+/);
  });

  it('nên duy trì chuỗi streak nếu hôm qua đã học dù hôm nay chưa học', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dayBeforeYesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    prismaMock.userCard.groupBy.mockResolvedValue([]);
    prismaMock.userCard.count.mockResolvedValue(0);
    prismaMock.userCard.findMany
      .mockResolvedValueOnce([]) // allCardCreatedDates
      .mockResolvedValueOnce([]); // cardsWithStability

    prismaMock.review.findMany
      .mockResolvedValueOnce([{ rating: 1, reviewedAt: yesterday }]) // recentReviews (POOR status: 0%)
      .mockResolvedValueOnce([{ reviewedAt: yesterday }, { reviewedAt: dayBeforeYesterday }]) // allReviewDates -> 2 days streak
      .mockResolvedValueOnce([]) // reviewsPriorWeek
      .mockResolvedValueOnce([]); // historyReviews

    const result = await service.getStats('yesterday-user');

    expect(result.summary.streak.studiedToday).toBe(false);
    expect(result.summary.streak.current).toBe(2);
    expect(result.summary.retentionRate7Days.rate).toBe(0);
    expect(result.summary.retentionRate7Days.status).toBe('POOR');
    expect(result.summary.retentionRate7Days.statusText).toBe('Cần cố gắng');
  });

  describe('getDayDetail', () => {
    it('nên trả về chi tiết ngày gồm thẻ mới và lượt ôn tập khi có hoạt động', async () => {
      const targetDate = '2026-10-22';
      const mockCreatedCards = [
        {
          id: 'card-1',
          word: { term: 'serendipity' },
          createdAt: new Date('2026-10-22T08:30:00Z'),
        },
      ];
      const mockReviews = [
        {
          id: 'rev-1',
          word: { term: 'ubiquitous' },
          rating: 4,
          reviewedAt: new Date('2026-10-22T09:15:00Z'),
        },
        {
          id: 'rev-2',
          word: { term: 'ephemeral' },
          rating: 1,
          reviewedAt: new Date('2026-10-22T10:00:00Z'),
        },
      ];

      prismaMock.userCard.findMany.mockResolvedValue(mockCreatedCards);
      prismaMock.review.findMany.mockResolvedValue(mockReviews);

      const result = await service.getDayDetail('user-123', targetDate);

      expect(result.date).toBe(targetDate);
      expect(result.newWords).toBe(1);
      expect(result.reviews).toBe(2);
      expect(result.words).toHaveLength(3);

      // Thẻ mới
      expect(result.words[0]).toEqual({
        id: 'card-1',
        word: 'serendipity',
        kind: 'new',
      });

      // Lượt ôn tập với rating ánh xạ
      expect(result.words[1]).toEqual({
        id: 'rev-1',
        word: 'ubiquitous',
        kind: 'review',
        rating: 'easy',
      });
      expect(result.words[2]).toEqual({
        id: 'rev-2',
        word: 'ephemeral',
        kind: 'review',
        rating: 'forgot',
      });
    });

    it('nên xử lý an toàn khi không có hoạt động nào trong ngày', async () => {
      prismaMock.userCard.findMany.mockResolvedValue([]);
      prismaMock.review.findMany.mockResolvedValue([]);

      const result = await service.getDayDetail('user-empty', '2026-10-20');

      expect(result.date).toBe('2026-10-20');
      expect(result.newWords).toBe(0);
      expect(result.reviews).toBe(0);
      expect(result.words).toHaveLength(0);
    });
  });
});
