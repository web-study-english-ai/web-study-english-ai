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