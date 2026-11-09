"use client";

import { cn } from "@/lib/utils";
import { formatNumber } from "../lib/admin_format";
import { PageMeta } from "../types/admin_types";

interface Props {
  meta: PageMeta;
  count: number; // số dòng đang hiển thị ở trang này
  noun: string; // "từ vựng", "tài khoản", "bài đọc"
  onPageChange: (page: number) => void;
}

function getPages(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

const btn =
  "h-8 min-w-8 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40";

export function AdminPagination({ meta, count, noun, onPageChange }: Props) {
  const { page, limit, total, totalPages } = meta;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = total === 0 ? 0 : from + count - 1;

  return (
    <div className="flex flex-col items-center justify-between gap-3 py-4 text-xs text-muted-foreground sm:flex-row">
      <span>
        Hiển thị {from}–{to} trên tổng số {formatNumber(total)} {noun}
      </span>

      {totalPages > 1 && (
        <nav aria-label="Phân trang" className="flex items-center gap-1">
          <button
            type="button"
            className={btn}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Trước
          </button>

          {getPages(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-1">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? "page" : undefined}
                onClick={() => onPageChange(p)}
                className={cn(
                  btn,
                  p === page && "border-primary bg-primary text-primary-foreground hover:bg-primary"
                )}
              >
                {p}
              </button>
            )
          )}

          <button
            type="button"
            className={btn}
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Sau
          </button>
        </nav>
      )}
    </div>
  );
}