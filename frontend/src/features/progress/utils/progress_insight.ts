export type ProgressLevel = "excellent" | "good" | "average" | "low";

export function getProgressLevel(retentionRate: number): ProgressLevel {
  if (retentionRate >= 85) return "excellent";
  if (retentionRate >= 70) return "good";
  if (retentionRate >= 50) return "average";
  return "low";
}

export const LEVEL_META: Record<
  ProgressLevel,
  { label: string; textClass: string; message: string }
> = {
  excellent: {
    label: "Xuất sắc",
    textClass: "text-blue-600 dark:text-blue-400",
    message: "Bạn đang tiến bộ rất tốt! Hãy duy trì chuỗi ngày học để giữ vững đà bứt phá nhé. 🚀",
  },
  good: {
    label: "Tốt",
    textClass: "text-green-600 dark:text-green-400",
    message: "Bạn học khá đều! Ôn thêm những từ khó để nâng tỷ lệ ghi nhớ nhé.",
  },
  average: {
    label: "Trung bình",
    textClass: "text-yellow-600 dark:text-yellow-400",
    message: "Tỷ lệ ghi nhớ ở mức trung bình. Ôn tập theo lịch mỗi ngày sẽ cải thiện rõ rệt.",
  },
  low: {
    label: "Cần cố gắng",
    textClass: "text-destructive",
    message: "Bạn đang quên khá nhiều từ. Đừng nản, hãy ôn lại các từ đến hạn ngay hôm nay!",
  },
};