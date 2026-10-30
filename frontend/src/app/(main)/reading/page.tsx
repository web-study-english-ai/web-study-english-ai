"use client";

import { useMemo, useState } from "react";
import { PageContainer } from "@/components/shared/PageContainer";
import { cn } from "@/lib/utils";
import { ReadingFilters } from "@/features/reading/components/ReadingFilters";
import { ReadingCard } from "@/features/reading/components/ReadingCard";
import { ReadingPagination } from "@/features/reading/components/ReadingPagination";
import { useReadingList } from "@/features/reading/hooks/useReadingList";
import { useDebouncedValue } from "@/features/reading/hooks/useDebouncedValue";
import { SORT_OPTIONS } from "@/features/reading/utils/reading_format";
import {
  ReadingFilterState,
  ReadingListParams,
} from "@/features/reading/types/reading_types";

const PAGE_SIZE = 5;

const DEFAULT_FILTERS: ReadingFilterState = {
  searchInput: "",
  cefr: "all",
  topic: "all",
  status: "all",
  sort: "",
};

export default function ReadingPage() {
  const [filters, setFilters] = useState<ReadingFilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(filters.searchInput, 300);

  const params = useMemo<ReadingListParams>(
    () => ({
      search,
      cefr: filters.cefr,
      topic: filters.topic,
      status: filters.status,
      sort: filters.sort,
      page,
      limit: PAGE_SIZE,
    }),
    [search, filters.cefr, filters.topic, filters.status, filters.sort, page]
  );

  const { data, isLoading, isError, isPlaceholderData, refetch } = useReadingList(params);

  function handleFilterChange(patch: Partial<ReadingFilterState>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }

  return (
    <PageContainer>
      <h1 className="font-heading text-2xl font-semibold text-foreground">Chọn bài đọc</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Luyện kỹ năng đọc hiểu qua từng chủ đề. Chọn bài phù hợp và bắt đầu theo nhịp của bạn.
      </p>

      <div className="mt-6">
        <ReadingFilters
          value={filters}
          topics={data?.topics ?? []}
          onChange={handleFilterChange}
        />
      </div>

      {isLoading && (
        <div className="mt-6 space-y-3" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      )}

      {isError && (
        <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-8 text-center">
          <p className="text-sm text-destructive">
            Không thể tải danh sách bài đọc. Vui lòng kiểm tra kết nối.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Thử lại
          </button>
        </div>
      )}

      {data && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-foreground">Tất cả bài đọc</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {data.meta.total}
              </span>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Sắp xếp:
              <select
                value={filters.sort}
                onChange={(e) => handleFilterChange({ sort: e.target.value })}
                className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {data.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground">
                Không tìm thấy bài đọc phù hợp với bộ lọc hiện tại.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Xóa bộ lọc
              </button>
            </div>
          ) : (
            <div
              className={cn(
                "overflow-hidden rounded-2xl border border-border bg-card transition-opacity",
                isPlaceholderData && "opacity-60"
              )}
            >
              {data.items.map((item) => (
                <ReadingCard key={item.id} item={item} />
              ))}
              <ReadingPagination
                meta={data.meta}
                count={data.items.length}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}