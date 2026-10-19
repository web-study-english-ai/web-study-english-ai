import { Award } from "lucide-react";
import { getProgressLevel, LEVEL_META } from "../utils/progress_insight";

interface Props {
  retentionRate: number;
  message?: string; // câu nhận xét từ Backend, nếu có
}

export function ProgressInsightBanner({ retentionRate, message }: Props) {
  const text = message ?? LEVEL_META[getProgressLevel(retentionRate)].message;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <Award className="h-4 w-4 shrink-0" />
      {text}
    </div>
  );
}