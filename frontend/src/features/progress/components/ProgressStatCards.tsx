import {
  BookOpen,
  CheckCircle2,
  Flame,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressStats } from "../types/progress_types";
import { getProgressLevel, LEVEL_META } from "../utils/progress_insight";

function StatCard({
  title,
  icon: Icon,
  iconClass,
  children,
}: {
  title: string;
  icon: LucideIcon;
  iconClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{title}</p>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            iconClass
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function streakNote(streak: number, best: number) {
  if (streak === 0) return "Hôm nay hãy học để bắt đầu chuỗi mới";
  if (streak >= best) return "Bạn đang giữ kỷ lục cá nhân!";
  if (best - streak <= 3) return "Sắp lập kỷ lục mới rồi";
  return `Kỷ lục của bạn: ${best} ngày`;
}

function deltaNote(delta: number) {
  if (delta > 0) return `↑ ${delta}% so với tuần trước`;
  if (delta < 0) return `↓ ${Math.abs(delta)}% so với tuần trước`;
  return "Không đổi so với tuần trước";
}

export function ProgressStatCards({ stats }: { stats: ProgressStats }) {
  const level = LEVEL_META[getProgressLevel(stats.retentionRate7d)];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard title="Tổng từ đã học" icon={BookOpen} iconClass="bg-green-100 text-green-600">
        <p className="font-heading text-3xl font-bold text-foreground">{stats.totalWords} từ</p>
        <p className="mt-1 text-sm text-green-600">
          {stats.weeklyGain > 0
            ? `+${stats.weeklyGain} từ so với tuần trước`
            : "Chưa có từ mới so với tuần trước"}
        </p>
      </StatCard>

      <StatCard title="Tỷ lệ ghi nhớ 7 ngày" icon={CheckCircle2} iconClass="bg-blue-100 text-blue-600">
        <p className="font-heading text-3xl font-bold text-foreground">{stats.retentionRate7d}%</p>
        <p className={cn("mt-1 text-sm", level.textClass)}>
          Đạt trạng thái: {stats.retentionStatusText ?? level.label}
        </p>
      </StatCard>

      <StatCard title="Chuỗi ngày liên tục" icon={Flame} iconClass="bg-orange-100 text-orange-500">
        <p className="font-heading text-3xl font-bold text-foreground">{stats.streakDays} ngày</p>
        <p className="mt-1 text-sm text-orange-500">
          {stats.streakMessage ?? streakNote(stats.streakDays, stats.bestStreakDays)}
        </p>
      </StatCard>

      <StatCard title="Độ bền trí nhớ" icon={TrendingUp} iconClass="bg-purple-100 text-purple-600">
        <p className="font-heading text-3xl font-bold text-foreground">{stats.memoryStrength}%</p>
        <p
          className={cn(
            "mt-1 text-sm",
            stats.memoryStrengthDelta < 0 ? "text-destructive" : "text-purple-600 dark:text-purple-400"
          )}
        >
          {deltaNote(stats.memoryStrengthDelta)}
        </p>
      </StatCard>
    </div>
  );
}