"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ReadingFilterState,
  ReadingStatus,
  ReadingTopic,
} from "../types/reading_types";
import { CEFR_FILTERS, STATUS_OPTIONS } from "../utils/reading_format";

interface Props {
  value: ReadingFilterState;
  topics: ReadingTopic[];
  onChange: (patch: Partial<ReadingFilterState>) => void;
}

const selectClass =
  "h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30";

export function ReadingFilters({ value, topics, onChange }: Props) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            aria-label="Tìm bài đọc"
            value={value.searchInput}
            onChange={(e) => onChange({ searchInput: e.target.value })}
            placeholder="Tìm theo tiêu đề hoặc nội dung bài đọc..."
            className="h-10 w-full rounded-xl bg-muted/70 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Chủ đề:
          <select
            className={selectClass}
            value={value.topic}
            onChange={(e) => onChange({ topic: e.target.value })}
          >
            <option value="all">Tất cả chủ đề</option>
            {topics.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Trạng thái:
          <select
            className={selectClass}
            value={value.status}
            onChange={(e) =>
              onChange({ status: e.target.value as ReadingStatus | "all" })
            }
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted-foreground">Trình độ</span>
        {CEFR_FILTERS.map((lv) => (
          <button
            key={lv}
            type="button"
            aria-pressed={value.cefr === lv}
            onClick={() => onChange({ cefr: lv })}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              value.cefr === lv
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {lv === "all" ? "Tất cả" : lv}
          </button>
        ))}
      </div>
    </div>
  );
}