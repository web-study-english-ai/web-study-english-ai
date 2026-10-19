"use client";

import { PageContainer } from "@/components/shared/PageContainer";
import { useProgressStats } from "@/features/progress/hooks/useProgress";
import { ProgressStatCards } from "@/features/progress/components/ProgressStatCards";
import { ChartCard, LegendItem } from "@/features/progress/components/ChartCard";
import { MemoryStrengthChart } from "@/features/progress/components/MemoryStrengthChart";
import { StatusCard} from "@/features/progress/components/StatusCards";
import { DailyActivityChart } from "@/features/progress/components/DailyActivityChart";
import { ProgressInsightBanner } from "@/features/progress/components/ProgressInsightBanner";
import {
  ProgressEmpty,
  ProgressError,
  ProgressSkeleton,
} from "@/features/progress/components/ProgressStates";

export default function ProgressPage() {
  const { data, isLoading, isError, refetch } = useProgressStats();

  return (
    <PageContainer>
      <h1 className="font-heading text-2xl font-semibold text-foreground">
        Thống kê tiến độ học tập
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Theo dõi sự phát triển độ bền trí nhớ và mức độ chăm chỉ của bạn.
      </p>

      {isLoading && <ProgressSkeleton />}
      {isError && <ProgressError onRetry={() => refetch()} />}
      {data && data.totalWords === 0 && <ProgressEmpty />}

      {data && data.totalWords > 0 && (
        <div className="mt-6 space-y-4">
          <ProgressStatCards stats={data} />

          <ChartCard
            title="Tổng độ bền trí nhớ theo thời gian"
            subtitle="Chỉ số đánh giá khả năng lưu trữ từ vựng dài hạn (30 ngày gần nhất)"
            legend={<LegendItem line colorClass="bg-primary" label="Độ bền trung bình" />}
          >
            <MemoryStrengthChart data={data.memoryStrengthTimeline} />
          </ChartCard>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ChartCard title="Phân bố trạng thái thẻ">
              <StatusCard counts={data.statusCounts} />
            </ChartCard>

            <ChartCard
              title="Hoạt động hàng ngày"
              legend={
                <>
                  <LegendItem colorClass="bg-teal-500" label="Từ mới" />
                  <LegendItem colorClass="bg-primary" label="Ôn tập" />
                </>
              }
            >
              <DailyActivityChart data={data.dailyActivity} />
            </ChartCard>
          </div>

          <ProgressInsightBanner
            retentionRate={data.retentionRate7d}
            message={data.motivationalMessage}
          />
        </div>
      )}
    </PageContainer>
  );
}