"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { ReadingDetail } from "@/features/reading/components/ReadingDetail";
import { useReadingDetail } from "@/features/reading/hooks/useReadingDetail";

export default function ReadingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useReadingDetail(id);

  // "Làm lại": đổi key để dựng lại bài từ đầu, bỏ qua bản nháp cũ
  const [run, setRun] = useState({ key: 0, fresh: false });

  return (
    <PageContainer>
      {isLoading && (
        <div className="space-y-4" aria-busy="true">
          <div className="h-12 animate-pulse rounded-2xl bg-muted" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-96 animate-pulse rounded-2xl bg-muted" />
            <div className="h-96 animate-pulse rounded-2xl bg-muted" />
          </div>
        </div>
      )}

      {isError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-8 text-center">
          <p className="text-sm text-destructive">Không thể tải bài đọc này.</p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Thử lại
            </button>
            <Link
              href="/reading"
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Về danh sách
            </Link>
          </div>
        </div>
      )}

      {data && (
        <ReadingDetail
          key={run.key}
          detail={data}
          restoreDraft={!run.fresh}
          onRetry={() => setRun((r) => ({ key: r.key + 1, fresh: true }))}
        />
      )}
    </PageContainer>
  );
}