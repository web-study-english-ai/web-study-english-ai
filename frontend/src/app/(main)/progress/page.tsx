"use client";

import { useState } from "react";
import { PageContainer } from "@/components/shared/PageContainer";
import { useProgressStats } from "@/features/progress/hooks/useProgress";
import { ProgressRange } from "@/features/progress/types/progress_types";
import { RANGE_META } from "@/features/progress/utils/progress_range";
import { ProgressStatCards } from "@/features/progress/components/ProgressStatCards";
import { RangeSelector } from "@/features/progress/components/RangeSelector";
import { ChartCard, LegendItem } from "@/features/progress/components/ChartCard";
import { MemoryStrengthChart } from "@/features/progress/components/MemoryStrengthChart";
import { StatusCards } from "@/features/progress/components/StatusCards";
import { DailyActivityChart } from "@/features/progress/components/DailyActivityChart";
import { ProgressInsightBanner } from "@/features/progress/components/ProgressInsightBanner";
import { DayDetailCard } from "@/features/progress/components/DayDetailCard";
import {
  ProgressEmpty,
  ProgressError,
  ProgressSkeleton,
} from "@/features/progress/components/ProgressStates";

export default function ProgressPage() {
  const [range, setRange] = useState<ProgressRange>("week");
  const { data, isLoading, isError, isPlaceholderData, refetch } = useProgressStats(range);
  const meta = RANGE_META[range];

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

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Xem biểu đồ theo</p>
            <RangeSelector value={range} onChange={setRange} />
          </div>

          <ChartCard
            title="Tổng độ bền trí nhớ theo thời gian"
            subtitle={meta.lineSubtitle}
            legend={<LegendItem line colorClass="bg-primary" label="Độ bền trung bình" />}
            isLoading={isPlaceholderData}
          >
            <MemoryStrengthChart data={data.memoryStrengthTimeline} />
          </ChartCard>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ChartCard title="Phân bố trạng thái thẻ">
              <StatusCards counts={data.statusCounts} />
            </ChartCard>

            <ChartCard
              title={meta.activityTitle}
              legend={
                <>
                  <LegendItem colorClass="bg-teal-500" label="Từ mới" />
                  <LegendItem colorClass="bg-primary" label="Ôn tập" />
                </>
              }
              isLoading={isPlaceholderData}
            >
              <DailyActivityChart data={data.dailyActivity} />
            </ChartCard>
          </div>
          <DayDetailCard />
          <ProgressInsightBanner
            retentionRate={data.retentionRate7d}
            message={data.motivationalMessage}
          />
        </div>
      )}
    </PageContainer>
  );
}