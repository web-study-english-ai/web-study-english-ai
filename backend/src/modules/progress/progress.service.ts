import { Injectable } from '@nestjs/common';
import { CardState } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  ProgressStatsResponse,
  ProgressSummary,
  StabilityTimelinePoint,
  CardDistribution,
  DailyActivityPoint,
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

  async getStats(userId: string): Promise<ProgressStatsResponse> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * MOT_NGAY_MS);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * MOT_NGAY_MS);

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
      // Có thẻ nhưng chưa ôn tập trong tuần này
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

    // Nếu hôm nay chưa học thì kiểm tra xem hôm qua có học không để giữ streak
    if (!studiedToday) {
      checkDate.setTime(checkDate.getTime() - MOT_NGAY_MS);
    }

    while (activeDatesSet.has(this.getVnDateString(checkDate))) {
      currentStreak++;
      checkDate.setTime(checkDate.getTime() - MOT_NGAY_MS);
    }

    // Tính chuỗi ngày dài nhất trong lịch sử (longest streak)
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

    // 5. Độ bền trí nhớ (Memory Stability - FSRS AI)
    // Quy đổi độ bền S (số ngày duy trì 90% trí nhớ) sang thang điểm 0 - 100%
    // 30 ngày ổn định coi như đạt 100% trí nhớ dài hạn
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

    // Tính biến động so với tuần trước
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

    // 6. Biểu đồ đường độ bền trí nhớ 30 ngày (Stability Timeline theo 4 tuần)
    const reviews30Days = await this.prisma.review.findMany({
      where: {
        userId,
        reviewedAt: { gte: thirtyDaysAgo },
        stabilityAfter: { not: null },
      },
      select: {
        reviewedAt: true,
        stabilityAfter: true,
      },
      orderBy: { reviewedAt: 'asc' },
    });

    const stabilityTimeline: StabilityTimelinePoint[] = [];
    const weekIntervals = [
      { label: 'Tuần 1', daysAgo: 21 },
      { label: 'Tuần 2', daysAgo: 14 },
      { label: 'Tuần 3', daysAgo: 7 },
      { label: 'Tuần 4', daysAgo: 0 },
    ];

    for (const week of weekIntervals) {
      const targetTime = new Date(now.getTime() - week.daysAgo * MOT_NGAY_MS);
      const reviewsUpToWeek = reviews30Days.filter((r) => r.reviewedAt <= targetTime);

      let weekScore = 0;
      if (reviewsUpToWeek.length > 0) {
        const total = reviewsUpToWeek.reduce(
          (sum, r) => sum + Math.min(100, Math.round(((r.stabilityAfter ?? 0) / 30) * 100)),
          0,
        );
        weekScore = Math.round(total / reviewsUpToWeek.length);
      } else if (memoryStabilityScore > 0 && week.label === 'Tuần 4') {
        weekScore = memoryStabilityScore;
      }

      stabilityTimeline.push({
        label: week.label,
        date: this.getVnDateString(targetTime),
        value: weekScore,
      });
    }

    // 7. Hoạt động hàng ngày 7 ngày gần nhất (T2 -> CN)
    const dailyActivity: DailyActivityPoint[] = [];
    const sevenDaysList: Date[] = [];

    for (let i = 6; i >= 0; i--) {
      sevenDaysList.push(new Date(now.getTime() - i * MOT_NGAY_MS));
    }

    const recentUserCards = await this.prisma.userCard.findMany({
      where: {
        userId,
        createdAt: { gte: new Date(now.getTime() - 7 * MOT_NGAY_MS) },
      },
      select: { createdAt: true },
    });

    for (const dayDate of sevenDaysList) {
      const dateStr = this.getVnDateString(dayDate);
      const vnTime = new Date(dayDate.getTime() + VN_TIMEZONE_OFFSET_MS);
      const dayLabel = VN_DAY_NAMES[vnTime.getUTCDay()];

      const newWordsCount = recentUserCards.filter(
        (c) => this.getVnDateString(c.createdAt) === dateStr,
      ).length;

      // Đếm số lượt review thực tế theo dateStr
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
      summary,
      stabilityTimeline,
      cardDistribution,
      dailyActivity,
      motivationalMessage,
    };
  }
}
