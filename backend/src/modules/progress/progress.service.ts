import { Injectable } from '@nestjs/common';
import { CardState } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  ProgressStatsResponse,
  ProgressSummary,
  StabilityTimelinePoint,
  CardDistribution,
  DailyActivityPoint,
  TotalWordsPoint,
  ProgressRange,
  DayDetailResponse,
  DayWordEntry,
} from './dto/progress-stats.dto';

const MOT_NGAY_MS = 24 * 60 * 60 * 1000;
const VN_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000;
const VN_DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  private getVnDateString(date: Date | string | number): string {
    const d = typeof date === 'object' && date instanceof Date ? date : new Date(date);
    const vnTime = new Date(d.getTime() + VN_TIMEZONE_OFFSET_MS);
    return vnTime.toISOString().slice(0, 10);
  }

  private startOfVnDay(date: Date = new Date()): Date {
    const vnTime = new Date(date.getTime() + VN_TIMEZONE_OFFSET_MS);
    const startVnUtc = new Date(
      Date.UTC(vnTime.getUTCFullYear(), vnTime.getUTCMonth(), vnTime.getUTCDate()),
    );
    return new Date(startVnUtc.getTime() - VN_TIMEZONE_OFFSET_MS);
  }

  private getVnDayUtcBounds(dateStr: string): { startUtc: Date; endUtc: Date } {
    const [y, m, d] = dateStr.split('-').map(Number);
    const startUtc = new Date(Date.UTC(y, m - 1, d) - VN_TIMEZONE_OFFSET_MS);
    const endUtc = new Date(startUtc.getTime() + MOT_NGAY_MS - 1);
    return { startUtc, endUtc };
  }

  async getStats(userId: string, range: ProgressRange = 'week'): Promise<ProgressStatsResponse> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * MOT_NGAY_MS);
    const historyRangeAgo = new Date(now.getTime() - 180 * MOT_NGAY_MS);

    // 1. Lấy dữ liệu thẻ và phân bố trạng thái
    const cardGroups = await this.prisma.userCard.groupBy({
      by: ['state'],
      where: { userId },
      _count: { id: true },
    });

    let masteredCount = 0;
    let learningCount = 0;
    let unlearnedCount = 0;

    for (const group of cardGroups) {
      if (group.state === CardState.REVIEW) {
        masteredCount += group._count.id;
      } else if (group.state === CardState.LEARNING || group.state === CardState.RELEARNING) {
        learningCount += group._count.id;
      } else if (group.state === CardState.NEW) {
        unlearnedCount += group._count.id;
      }
    }

    const totalWordsCount = masteredCount + learningCount + unlearnedCount;

    const cardDistribution: CardDistribution = {
      mastered: {
        count: masteredCount,
        percentage: totalWordsCount > 0 ? Math.round((masteredCount / totalWordsCount) * 100) : 0,
      },
      learning: {
        count: learningCount,
        percentage: totalWordsCount > 0 ? Math.round((learningCount / totalWordsCount) * 100) : 0,
      },
      unlearned: {
        count: unlearnedCount,
        percentage:
          totalWordsCount > 0
            ? Math.max(
                0,
                100 -
                  Math.round((masteredCount / totalWordsCount) * 100) -
                  Math.round((learningCount / totalWordsCount) * 100),
              )
            : 0,
      },
      total: totalWordsCount,
    };

    // 2. Tổng từ học mới trong 7 ngày qua (changeVsLastWeek)
    const wordsAddedLast7Days = await this.prisma.userCard.count({
      where: {
        userId,
        createdAt: { gte: sevenDaysAgo },
      },
    });

    // 3. Tỷ lệ nhớ 7 ngày gần nhất (Retention rate)
    const recentReviews = await this.prisma.review.findMany({
      where: {
        userId,
        reviewedAt: { gte: sevenDaysAgo },
      },
      select: {
        rating: true,
      },
    });

    const totalRecentReviews = recentReviews.length;
    const passedRecentReviews = recentReviews.filter((r) => r.rating >= 3).length;

    let retentionRate = 0;
    let retentionStatus: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' = 'EXCELLENT';
    let retentionStatusText = 'Xuất sắc';

    if (totalRecentReviews > 0) {
      retentionRate = Math.round((passedRecentReviews / totalRecentReviews) * 100);
      if (retentionRate >= 85) {
        retentionStatus = 'EXCELLENT';
        retentionStatusText = 'Xuất sắc';
      } else if (retentionRate >= 70) {
        retentionStatus = 'GOOD';
        retentionStatusText = 'Tốt';
      } else if (retentionRate >= 50) {
        retentionStatus = 'FAIR';
        retentionStatusText = 'Trung bình';
      } else {
        retentionStatus = 'POOR';
        retentionStatusText = 'Cần cố gắng';
      }
    } else if (totalWordsCount > 0) {
      retentionRate = 100;
      retentionStatus = 'EXCELLENT';
      retentionStatusText = 'Xuất sắc';
    }

    // 4. Tính chuỗi ngày học liên tục (Streak)
    const [allReviewDates, allCardCreatedDates] = await Promise.all([
      this.prisma.review.findMany({
        where: { userId },
        select: { reviewedAt: true },
      }),
      this.prisma.userCard.findMany({
        where: { userId },
        select: { createdAt: true },
      }),
    ]);

    const activeDatesSet = new Set<string>();
    for (const r of allReviewDates) {
      activeDatesSet.add(this.getVnDateString(r.reviewedAt));
    }
    for (const c of allCardCreatedDates) {
      activeDatesSet.add(this.getVnDateString(c.createdAt));
    }

    const todayVnStr = this.getVnDateString(now);
    const studiedToday = activeDatesSet.has(todayVnStr);

    let currentStreak = 0;
    const checkDate = new Date(now.getTime());

    if (!studiedToday) {
      checkDate.setTime(checkDate.getTime() - MOT_NGAY_MS);
    }

    while (activeDatesSet.has(this.getVnDateString(checkDate))) {
      currentStreak++;
      checkDate.setTime(checkDate.getTime() - MOT_NGAY_MS);
    }

    let longestStreak = currentStreak;
    if (activeDatesSet.size > 0) {
      const sortedDates = Array.from(activeDatesSet).sort();
      let maxChain = 1;
      let currentChain = 1;

      for (let i = 1; i < sortedDates.length; i++) {
        const prev = new Date(`${sortedDates[i - 1]}T00:00:00Z`).getTime();
        const curr = new Date(`${sortedDates[i]}T00:00:00Z`).getTime();
        const diffDays = Math.round((curr - prev) / MOT_NGAY_MS);

        if (diffDays === 1) {
          currentChain++;
          if (currentChain > maxChain) maxChain = currentChain;
        } else {
          currentChain = 1;
        }
      }
      longestStreak = Math.max(currentStreak, maxChain);
    }

    let streakMessage = '🔥 Duy trì thói quen học mỗi ngày!';
    if (currentStreak >= 10) {
      streakMessage = '🔥 Sắp lập kỷ lục mới rồi';
    } else if (currentStreak >= 3) {
      streakMessage = '🔥 Đang giữ phong độ rất tốt!';
    } else if (studiedToday) {
      streakMessage = '✨ Đã hoàn thành mục tiêu học hôm nay';
    }

    // 5. Độ bền trí nhớ hiện tại (Memory Stability - FSRS AI)
    const cardsWithStability = await this.prisma.userCard.findMany({
      where: {
        userId,
        stability: { not: null },
      },
      select: {
        stability: true,
      },
    });

    let memoryStabilityScore = 0;
    if (cardsWithStability.length > 0) {
      const totalScore = cardsWithStability.reduce((acc, card) => {
        const s = card.stability ?? 0;
        const normalized = Math.min(100, Math.round((s / 30) * 100));
        return acc + normalized;
      }, 0);
      memoryStabilityScore = Math.round(totalScore / cardsWithStability.length);
    }

    // Biến động độ bền so với tuần trước
    const reviewsPriorWeek = await this.prisma.review.findMany({
      where: {
        userId,
        reviewedAt: {
          lt: sevenDaysAgo,
          gte: new Date(now.getTime() - 14 * MOT_NGAY_MS),
        },
        stabilityAfter: { not: null },
      },
      select: {
        stabilityAfter: true,
      },
    });

    let stabilityChangeVsLastWeek = 0;
    if (reviewsPriorWeek.length > 0) {
      const priorScoreAvg =
        reviewsPriorWeek.reduce((sum, r) => {
          return sum + Math.min(100, Math.round(((r.stabilityAfter ?? 0) / 30) * 100));
        }, 0) / reviewsPriorWeek.length;
      stabilityChangeVsLastWeek = Math.round(memoryStabilityScore - priorScoreAvg);
    } else if (memoryStabilityScore > 0) {
      stabilityChangeVsLastWeek = Math.min(15, memoryStabilityScore);
    }

    // 6. Truy vấn lịch sử reviews có stabilityAfter để vẽ biểu đồ timeline
    const historyReviews = await this.prisma.review.findMany({
      where: {
        userId,
        reviewedAt: { gte: historyRangeAgo },
        stabilityAfter: { not: null },
      },
      select: {
        reviewedAt: true,
        stabilityAfter: true,
      },
      orderBy: { reviewedAt: 'asc' },
    });

    const getScoreUpTo = (targetTime: Date, fallback: number): number => {
      const filtered = historyReviews.filter((r) => r.reviewedAt <= targetTime);
      if (filtered.length > 0) {
        const total = filtered.reduce(
          (sum, r) => sum + Math.min(100, Math.round(((r.stabilityAfter ?? 0) / 30) * 100)),
          0,
        );
        return Math.round(total / filtered.length);
      }
      return fallback;
    };

    // 7. Xây dựng stabilityTimeline, totalWordsTimeline và dailyActivity theo `range`
    const stabilityTimeline: StabilityTimelinePoint[] = [];
    const totalWordsTimeline: TotalWordsPoint[] = [];
    const dailyActivity: DailyActivityPoint[] = [];

    if (range === 'day') {
      // Chế độ 'day': 14 ngày gần nhất
      const daysCount = 14;
      for (let i = daysCount - 1; i >= 0; i--) {
        const dayTime = new Date(now.getTime() - i * MOT_NGAY_MS);
        const dateStr = this.getVnDateString(dayTime);
        const dayLabel = `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;
        const endOfDayUtc = new Date(dayTime.getTime() + MOT_NGAY_MS - 1);

        const score = getScoreUpTo(endOfDayUtc, i === 0 ? memoryStabilityScore : 0);
        stabilityTimeline.push({
          label: dayLabel,
          date: dateStr,
          value: score,
        });

        const wordsUpToDay = allCardCreatedDates.filter((c) => c.createdAt <= endOfDayUtc).length;
        totalWordsTimeline.push({
          label: dayLabel,
          total: wordsUpToDay,
        });

        const newWordsCount = allCardCreatedDates.filter(
          (c) => this.getVnDateString(c.createdAt) === dateStr,
        ).length;
        const reviewsCount = allReviewDates.filter(
          (r) => this.getVnDateString(r.reviewedAt) === dateStr,
        ).length;

        dailyActivity.push({
          day: dayLabel,
          date: dateStr,
          newWords: newWordsCount,
          reviews: reviewsCount,
        });
      }
    } else if (range === 'month') {
      // Chế độ 'month': 6 tháng gần nhất
      const vnNow = new Date(now.getTime() + VN_TIMEZONE_OFFSET_MS);
      const currYear = vnNow.getUTCFullYear();
      const currMonth = vnNow.getUTCMonth(); // 0-11

      for (let i = 5; i >= 0; i--) {
        const d = new Date(Date.UTC(currYear, currMonth - i, 1));
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth();
        const monthNum = m + 1;
        const padM = String(monthNum).padStart(2, '0');
        const monthKey = `${y}-${padM}`;
        const label = `Thg ${monthNum}`;

        const startUtc = new Date(Date.UTC(y, m, 1) - VN_TIMEZONE_OFFSET_MS);
        const endUtc = new Date(Date.UTC(y, m + 1, 1) - VN_TIMEZONE_OFFSET_MS - 1);

        const score = getScoreUpTo(endUtc, i === 0 ? memoryStabilityScore : 0);
        stabilityTimeline.push({
          label,
          date: monthKey,
          value: score,
        });

        const wordsUpToMonth = allCardCreatedDates.filter((c) => c.createdAt <= endUtc).length;
        totalWordsTimeline.push({
          label,
          total: wordsUpToMonth,
        });

        const newWordsCount = allCardCreatedDates.filter(
          (c) => c.createdAt >= startUtc && c.createdAt <= endUtc,
        ).length;
        const reviewsCount = allReviewDates.filter(
          (r) => r.reviewedAt >= startUtc && r.reviewedAt <= endUtc,
        ).length;

        dailyActivity.push({
          day: label,
          date: monthKey,
          newWords: newWordsCount,
          reviews: reviewsCount,
        });
      }
    } else {
      // Chế độ 'week' (Mặc định): 4 tuần gần nhất cho timeline & 7 ngày gần nhất cho dailyActivity
      const weekIntervals = [
        { label: 'Tuần 1', daysAgo: 21 },
        { label: 'Tuần 2', daysAgo: 14 },
        { label: 'Tuần 3', daysAgo: 7 },
        { label: 'Tuần 4', daysAgo: 0 },
      ];

      for (const week of weekIntervals) {
        const targetTime = new Date(now.getTime() - week.daysAgo * MOT_NGAY_MS);
        const score = getScoreUpTo(targetTime, week.label === 'Tuần 4' ? memoryStabilityScore : 0);

        stabilityTimeline.push({
          label: week.label,
          date: this.getVnDateString(targetTime),
          value: score,
        });

        const wordsUpToWeek = allCardCreatedDates.filter((c) => c.createdAt <= targetTime).length;
        totalWordsTimeline.push({
          label: week.label,
          total: wordsUpToWeek,
        });
      }

      for (let i = 6; i >= 0; i--) {
        const dayDate = new Date(now.getTime() - i * MOT_NGAY_MS);
        const dateStr = this.getVnDateString(dayDate);
        const vnTime = new Date(dayDate.getTime() + VN_TIMEZONE_OFFSET_MS);
        const dayLabel = VN_DAY_NAMES[vnTime.getUTCDay()];

        const newWordsCount = allCardCreatedDates.filter(
          (c) => this.getVnDateString(c.createdAt) === dateStr,
        ).length;
        const actualReviewsCount = allReviewDates.filter(
          (r) => this.getVnDateString(r.reviewedAt) === dateStr,
        ).length;

        dailyActivity.push({
          day: dayLabel,
          date: dateStr,
          newWords: newWordsCount,
          reviews: actualReviewsCount,
        });
      }
    }

    // 8. Thông điệp khích lệ (Motivational message)
    let motivationalMessage =
      'Bạn đang tiến bộ rất tốt! Hãy duy trì chuỗi ngày học để giữ vững đà bứt phá nhé. 🚀';

    if (totalWordsCount === 0) {
      motivationalMessage =
        'Chào mừng bạn! Hãy thêm và học những từ vựng đầu tiên ngay hôm nay nhé. 📚';
    } else if (currentStreak >= 7) {
      motivationalMessage =
        '🎗️ Bạn đang tiến bộ rất tốt! Hãy duy trì chuỗi ngày học để giữ vững đà bứt phá nhé. 🚀';
    } else if (currentStreak >= 3) {
      motivationalMessage =
        '🔥 Phong độ học tập rất tuyệt vời! Tiếp tục duy trì để bứt phá thêm nhiều từ mới nhé.';
    } else if (!studiedToday) {
      motivationalMessage =
        'Học tập đều đặn mỗi ngày là chìa khóa vàng để ghi nhớ dài hạn. Hãy dành 5 phút ôn tập hôm nay nhé! 💡';
    }

    const summary: ProgressSummary = {
      totalWords: {
        count: totalWordsCount,
        changeVsLastWeek: wordsAddedLast7Days,
      },
      retentionRate7Days: {
        rate: retentionRate,
        status: retentionStatus,
        statusText: retentionStatusText,
      },
      streak: {
        current: currentStreak,
        longest: longestStreak,
        studiedToday,
        message: streakMessage,
      },
      memoryStability: {
        score: memoryStabilityScore,
        changeVsLastWeek: stabilityChangeVsLastWeek,
      },
    };

    return {
      totalWords: totalWordsCount,
      weeklyGain: wordsAddedLast7Days,
      statusCounts: {
        mastered: masteredCount,
        learning: learningCount,
        notLearned: unlearnedCount,
      },
      retentionRate7d: retentionRate,
      streakDays: currentStreak,
      bestStreakDays: longestStreak,
      totalWordsTimeline,

      summary,
      stabilityTimeline,
      cardDistribution,
      dailyActivity,
      motivationalMessage,
    };
  }

  async getDayDetail(userId: string, dateStr?: string): Promise<DayDetailResponse> {
    const targetDate =
      dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : this.getVnDateString(new Date());

    const { startUtc, endUtc } = this.getVnDayUtcBounds(targetDate);

    const [createdCards, dayReviews] = await Promise.all([
      this.prisma.userCard.findMany({
        where: {
          userId,
          createdAt: { gte: startUtc, lte: endUtc },
        },
        include: {
          word: { select: { term: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.review.findMany({
        where: {
          userId,
          reviewedAt: { gte: startUtc, lte: endUtc },
        },
        include: {
          word: { select: { term: true } },
        },
        orderBy: { reviewedAt: 'desc' },
      }),
    ]);

    const mapRating = (r: number): 'forgot' | 'hard' | 'medium' | 'easy' => {
      if (r === 1) return 'forgot';
      if (r === 2) return 'hard';
      if (r === 3) return 'medium';
      return 'easy';
    };

    const words: DayWordEntry[] = [
      ...createdCards.map((c) => ({
        id: c.id,
        word: c.word.term,
        kind: 'new' as const,
      })),
      ...dayReviews.map((r) => ({
        id: r.id,
        word: r.word.term,
        kind: 'review' as const,
        rating: mapRating(r.rating),
      })),
    ];

    return {
      date: targetDate,
      newWords: createdCards.length,
      reviews: dayReviews.length,
      words,
    };
  }
}
