"use client";

import { PageContainer } from "@/components/shared/PageContainer";
import { useProgressStats } from "@/features/progress/hooks/useProgress";
import { ProgressStatCards } from "@/features/progress/components/ProgressStatCards";
import { TotalWordsChart } from "@/features/progress/components/ProgressChart";
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
        Theo dõi sự phát triển số từ đã học và mức độ chăm chỉ của bạn.
      </p>

      {isLoading && <ProgressSkeleton />}
      {isError && <ProgressError onRetry={() => refetch()} />}
      {data && data.totalWords === 0 && <ProgressEmpty />}

      {data && data.totalWords > 0 && (
        <div className="mt-6 space-y-4">
          <ProgressStatCards stats={data} />

          <div className="rounded-2xl border border-border bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-heading text-base font-semibold text-foreground">
                Tổng số từ theo thời gian
              </h2>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block h-0.5 w-4 rounded bg-primary" />
                Số từ
              </span>
            </div>
            <TotalWordsChart data={data.totalWordsTimeline} />
          </div>

          <ProgressInsightBanner retentionRate={data.retentionRate7d} />
        </div>
      )}
    </PageContainer>
  );
}