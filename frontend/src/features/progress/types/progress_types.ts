export interface CardStatusCounts {
  mastered: number; // đã thuộc
  learning: number; // đang học
  notLearned: number; // chưa học
}

export interface TotalWordsPoint {
  label: string; // "Tuần 1", "Tuần 2"...
  total: number; // tổng số từ tích lũy tới cuối mốc đó
}

export interface ProgressStats {
  totalWords: number;
  weeklyGain: number; // số từ tăng thêm so với tuần trước
  statusCounts: CardStatusCounts;
  retentionRate7d: number; // 0–100
  streakDays: number;
  bestStreakDays: number;
  totalWordsTimeline: TotalWordsPoint[];
}