export interface CardStatusCounts {
  mastered: number; // đã thuộc
  learning: number; // đang học
  notLearned: number; // chưa học
}

export interface MemoryStrengthPoint {
  label: string; // "Tuần 1", "Tuần 2"...
  value: number; // 0–100
}

export interface DailyActivity {
  day: string; // "T2" ... "CN"
  newWords: number;
  reviews: number;
}

export interface ProgressStats {
  totalWords: number;
  weeklyGain: number; // số từ tăng thêm so với tuần trước
  statusCounts: CardStatusCounts;
  retentionRate7d: number; // 0–100
  streakDays: number;
  bestStreakDays: number;
  memoryStrength: number; // 0–100
  memoryStrengthDelta: number; // điểm % so với tuần trước, có thể âm
  memoryStrengthTimeline: MemoryStrengthPoint[];
  dailyActivity: DailyActivity[];
    retentionStatusText?: string;
  streakMessage?: string;
  motivationalMessage?: string;
}

export type ProgressRange = "day" | "week" | "month";

export type DayWordKind = "new" | "review";

export interface DayWordEntry {
  id: string;
  word: string;
  kind: DayWordKind; // học mới hay ôn tập
  rating?: "forgot" | "hard" | "medium" | "easy";
}

export interface DayDetail {
  date: string; // YYYY-MM-DD
  newWords: number;
  reviews: number;
  words: DayWordEntry[];
}