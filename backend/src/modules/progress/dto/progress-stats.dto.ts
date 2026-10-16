import { z } from 'zod';

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
  summary: progressSummarySchema,
  stabilityTimeline: z.array(stabilityTimelinePointSchema),
  cardDistribution: cardDistributionSchema,
  dailyActivity: z.array(dailyActivityPointSchema),
  motivationalMessage: z.string(),
});

export type ProgressSummary = z.infer<typeof progressSummarySchema>;
export type StabilityTimelinePoint = z.infer<typeof stabilityTimelinePointSchema>;
export type CardDistribution = z.infer<typeof cardDistributionSchema>;
export type DailyActivityPoint = z.infer<typeof dailyActivityPointSchema>;
export type ProgressStatsResponse = z.infer<typeof progressStatsResponseSchema>;
