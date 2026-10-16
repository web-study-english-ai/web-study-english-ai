import { Award } from "lucide-react";
import { getProgressLevel, LEVEL_META } from "../utils/progress_insight";

export function ProgressInsightBanner({ retentionRate }: { retentionRate: number }) {
  const meta = LEVEL_META[getProgressLevel(retentionRate)];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <Award className="h-4 w-4 shrink-0" />
      {meta.message}
    </div>
  );
}