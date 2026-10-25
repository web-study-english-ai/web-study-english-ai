import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const progressRangeSchema = z.enum(['day', 'week', 'month']);
export type ProgressRange = z.infer<typeof progressRangeSchema>;

export const getProgressStatsQuerySchema = z.object({
  range: progressRangeSchema.default('week').optional(),
});
export class GetProgressStatsQueryDto extends createZodDto(getProgressStatsQuerySchema) {}

export const getDayDetailQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Định dạng ngày phải là YYYY-MM-DD' })
    .optional(),
});
export class GetDayDetailQueryDto extends createZodDto(getDayDetailQuerySchema) {}

export const dayWordEntrySchema = z.object({
  id: z.string(),
  word: z.string(),
  kind: z.enum(['new', 'review']),
  rating: z.enum(['forgot', 'hard', 'medium', 'easy']).optional(),
});
export type DayWordEntry = z.infer<typeof dayWordEntrySchema>;

export const dayDetailResponseSchema = z.object({
  date: z.string(),
  newWords: z.number().int().min(0),
  reviews: z.number().int().min(0),
  words: z.array(dayWordEntrySchema),
});
export class DayDetailResponseDto extends createZodDto(dayDetailResponseSchema) {}
export type DayDetailResponse = z.infer<typeof dayDetailResponseSchema>;

export const cardStatusCountsSchema = z.object({
  mastered: z.number().int().min(0),
  learning: z.number().int().min(0),
  notLearned: z.number().int().min(0),
});

export const totalWordsPointSchema = z.object({
  label: z.string(),
  total: z.number().int().min(0),
});

export const progressSummarySchema = z.object({
  totalWords: z.object({
    count: z.number().int().min(0),
    changeVsLastWeek: z.number().int(),
  }),
  retentionRate7Days: z.object({
    rate: z.number().min(0).max(100),
    status: z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'POOR']),
    statusText: z.string(),
  }),
  streak: z.object({
    current: z.number().int().min(0),
    longest: z.number().int().min(0),
    studiedToday: z.boolean(),
    message: z.string(),
  }),
  memoryStability: z.object({
    score: z.number().min(0).max(100),
    changeVsLastWeek: z.number(),
  }),
});

export const stabilityTimelinePointSchema = z.object({
  label: z.string(),
  date: z.string(),
  value: z.number().min(0).max(100),
});

export const cardDistributionCategorySchema = z.object({
  count: z.number().int().min(0),
  percentage: z.number().min(0).max(100),
});

export const cardDistributionSchema = z.object({
  mastered: cardDistributionCategorySchema,
  learning: cardDistributionCategorySchema,
  unlearned: cardDistributionCategorySchema,
  total: z.number().int().min(0),
});

export const dailyActivityPointSchema = z.object({
  day: z.string(),
  date: z.string(),
  newWords: z.number().int().min(0),
  reviews: z.number().int().min(0),
});

export const progressStatsResponseSchema = z.object({
  // Frontend WSEA-116 Flat Fields
  totalWords: z.number().int().min(0),
  weeklyGain: z.number().int(),
  statusCounts: cardStatusCountsSchema,
  retentionRate7d: z.number().min(0).max(100),
  streakDays: z.number().int().min(0),
  bestStreakDays: z.number().int().min(0),
  totalWordsTimeline: z.array(totalWordsPointSchema),

  // Detailed fields
  summary: progressSummarySchema,
  stabilityTimeline: z.array(stabilityTimelinePointSchema),
  cardDistribution: cardDistributionSchema,
  dailyActivity: z.array(dailyActivityPointSchema),
  motivationalMessage: z.string(),
});

export class ProgressStatsResponseDto extends createZodDto(progressStatsResponseSchema) {}

export type CardStatusCounts = z.infer<typeof cardStatusCountsSchema>;
export type TotalWordsPoint = z.infer<typeof totalWordsPointSchema>;
export type ProgressSummary = z.infer<typeof progressSummarySchema>;
export type StabilityTimelinePoint = z.infer<typeof stabilityTimelinePointSchema>;
export type CardDistribution = z.infer<typeof cardDistributionSchema>;
export type DailyActivityPoint = z.infer<typeof dailyActivityPointSchema>;
export type ProgressStatsResponse = z.infer<typeof progressStatsResponseSchema>;
