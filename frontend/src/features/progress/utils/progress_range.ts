import { ProgressRange } from "../types/progress_types";

export const RANGE_OPTIONS: { value: ProgressRange; label: string }[] = [
  { value: "day", label: "Ngày" },
  { value: "week", label: "Tuần" },
  { value: "month", label: "Tháng" },
];

const LINE_SUBTITLE = "Chỉ số đánh giá khả năng lưu trữ từ vựng dài hạn";

export const RANGE_META: Record<
  ProgressRange,
  { lineSubtitle: string; activityTitle: string }
> = {
  day: {
    lineSubtitle: `${LINE_SUBTITLE} (14 ngày gần nhất)`,
    activityTitle: "Hoạt động hàng ngày",
  },
  week: {
    lineSubtitle: `${LINE_SUBTITLE} (30 ngày gần nhất)`,
    activityTitle: "Hoạt động hàng ngày",
  },
  month: {
    lineSubtitle: `${LINE_SUBTITLE} (6 tháng gần nhất)`,
    activityTitle: "Hoạt động hàng tháng",
  },
};