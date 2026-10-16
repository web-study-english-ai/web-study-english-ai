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

  it('nên tính đúng tỷ lệ nhớ, phân bố thẻ, độ bền trí nhớ và streak khi có dữ liệu', async () => {
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

    // Mock userCard.findMany được gọi nhiều lần:
    // 1. allCardCreatedDates (streak)
    // 2. cardsWithStability (stability score)
    // 3. recentUserCards (dailyActivity)
    prismaMock.userCard.findMany
      .mockResolvedValueOnce([{ createdAt: now }]) // allCardCreatedDates
      .mockResolvedValueOnce([
        { stability: 24.0 }, // 80%
        { stability: 30.0 }, // 100%
      ]) // cardsWithStability -> avg = 90%
      .mockResolvedValueOnce([{ createdAt: now }]); // recentUserCards

    // Mock review.findMany:
    // 1. recentReviews (7 days)
    // 2. allReviewDates (streak)
    // 3. reviewsPriorWeek (stability change)
    // 4. reviews30Days (timeline)
    prismaMock.review.findMany
      .mockResolvedValueOnce(recentReviews) // 7 days reviews
      .mockResolvedValueOnce([{ reviewedAt: now }]) // allReviewDates
      .mockResolvedValueOnce([{ stabilityAfter: 20.0 }]) // reviewsPriorWeek
      .mockResolvedValueOnce([{ reviewedAt: now, stabilityAfter: 25.0 }]); // reviews30Days

    const result = await service.getStats('active-user-456');

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

  it('nên duy trì chuỗi streak nếu hôm qua đã học dù hôm nay chưa học', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dayBeforeYesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    prismaMock.userCard.groupBy.mockResolvedValue([]);
    prismaMock.userCard.count.mockResolvedValue(0);
    prismaMock.userCard.findMany
      .mockResolvedValueOnce([]) // allCardCreatedDates
      .mockResolvedValueOnce([]) // cardsWithStability
      .mockResolvedValueOnce([]); // recentUserCards

    prismaMock.review.findMany
      .mockResolvedValueOnce([{ rating: 1, reviewedAt: yesterday }]) // recentReviews (POOR status: 0%)
      .mockResolvedValueOnce([{ reviewedAt: yesterday }, { reviewedAt: dayBeforeYesterday }]) // allReviewDates -> 2 days streak
      .mockResolvedValueOnce([]) // reviewsPriorWeek
      .mockResolvedValueOnce([]); // reviews30Days

    const result = await service.getStats('yesterday-user');

    expect(result.summary.streak.studiedToday).toBe(false);
    expect(result.summary.streak.current).toBe(2);
    expect(result.summary.retentionRate7Days.rate).toBe(0);
    expect(result.summary.retentionRate7Days.status).toBe('POOR');
    expect(result.summary.retentionRate7Days.statusText).toBe('Cần cố gắng');
  });
});
