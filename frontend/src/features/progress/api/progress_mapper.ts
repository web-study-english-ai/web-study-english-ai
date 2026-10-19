import { ProgressStats } from "../types/progress_types";

interface RawProgressResponse {
  totalWords?: number;
  weeklyGain?: number;
  statusCounts?: { mastered?: number; learning?: number; notLearned?: number };
  retentionRate7d?: number;
  streakDays?: number;
  bestStreakDays?: number;
  summary?: {
    totalWords?: { count?: number; changeVsLastWeek?: number };
    retentionRate7Days?: { rate?: number; status?: string; statusText?: string };
    streak?: {
      current?: number;
      longest?: number;
      studiedToday?: boolean;
      message?: string;
    };
    memoryStability?: { score?: number; changeVsLastWeek?: number };
  };
  stabilityTimeline?: { label: string; date?: string; value: number }[];
  cardDistribution?: {
    mastered?: { count?: number };
    learning?: { count?: number };
    unlearned?: { count?: number };
  };
  dailyActivity?: { day: string; date?: string; newWords: number; reviews: number }[];
  motivationalMessage?: string;
}

export function mapProgressStats(raw: RawProgressResponse): ProgressStats {
  const s = raw.summary;
  const dist = raw.cardDistribution;

  return {
    totalWords: s?.totalWords?.count ?? raw.totalWords ?? 0,
    weeklyGain: s?.totalWords?.changeVsLastWeek ?? raw.weeklyGain ?? 0,
    statusCounts: {
      mastered: raw.statusCounts?.mastered ?? dist?.mastered?.count ?? 0,
      learning: raw.statusCounts?.learning ?? dist?.learning?.count ?? 0,
      notLearned: raw.statusCounts?.notLearned ?? dist?.unlearned?.count ?? 0,
    },
    retentionRate7d: s?.retentionRate7Days?.rate ?? raw.retentionRate7d ?? 0,
    retentionStatusText: s?.retentionRate7Days?.statusText,
    streakDays: s?.streak?.current ?? raw.streakDays ?? 0,
    bestStreakDays: s?.streak?.longest ?? raw.bestStreakDays ?? 0,
    streakMessage: s?.streak?.message,
    memoryStrength: s?.memoryStability?.score ?? 0,
    memoryStrengthDelta: s?.memoryStability?.changeVsLastWeek ?? 0,
    memoryStrengthTimeline: (raw.stabilityTimeline ?? []).map((p) => ({
      label: p.label,
      value: p.value,
    })),
    dailyActivity: (raw.dailyActivity ?? []).map((d) => ({
      day: d.day,
      newWords: d.newWords,
      reviews: d.reviews,
    })),
    motivationalMessage: raw.motivationalMessage,
  };
}