"use client";

import { cn } from "@/lib/utils";
import { AdminPagination } from "@/features/admin/shared/components/AdminPagination";
import {
  actionDanger,
  actionEdit,
  Pill,
  StateBody,
  TableShell,
  TableStatus,
  tdClass,
  thClass,
} from "@/features/admin/shared/components/AdminTableParts";
import { formatNumber } from "@/features/admin/shared/lib/admin_format";
import { PageMeta } from "@/features/admin/shared/types/admin_types";
import { AdminReading } from "../types/reading_admin_types";

interface Props {
  items: AdminReading[];
  meta?: PageMeta;
  status: TableStatus;
  error: unknown;
  dimmed: boolean;
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onEdit: (reading: AdminReading) => void;
  onDelete: (reading: AdminReading) => void;
}

// "BD001 · 420 từ · 8 phút", dòng nào thiếu dữ liệu thì bỏ qua
function infoLine(r: AdminReading): string {
  return [
    r.code,
    r.wordCount > 0 ? `${formatNumber(r.wordCount)} từ` : "",
    r.estimatedMinutes > 0 ? `${r.estimatedMinutes} phút` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ReadingAdminTable({
  items,
  meta,
  status,
  error,
  dimmed,
  onRetry,
  onPageChange,
  onEdit,
  onDelete,
}: Props) {
  const start = meta ? (meta.page - 1) * meta.limit : 0;

  return (
    <>
      <TableShell dimmed={dimmed}>
        <thead className="border-b border-border">
          <tr>
            <th className={thClass}>STT</th>
            <th className={thClass}>Bài đọc</th>
            <th className={thClass}>Chủ đề</th>
            <th className={thClass}>Trình độ</th>
            <th className={thClass}>Số câu hỏi</th>
            <th className={cn(thClass, "text-right")}>Hành động</th>
          </tr>
        </thead>

        {status !== "ok" ? (
          <StateBody
            status={status}
            colSpan={6}
            error={error}
            emptyText="Không tìm thấy bài đọc phù hợp."
            onRetry={onRetry}
          />
        ) : (
          <tbody>
            {items.map((r, i) => (
              <tr key={r.id} className="border-b border-border last:border-b-0">
                <td className={cn(tdClass, "text-muted-foreground")}>{start + i + 1}</td>
                <td className={tdClass}>
                  <p className="font-semibold text-foreground">{r.title}</p>
                  {infoLine(r) && (
                    <p className="text-xs text-muted-foreground">{infoLine(r)}</p>
                  )}
                </td>
                <td className={cn(tdClass, "text-foreground")}>{r.topic || "—"}</td>
                <td className={tdClass}>
                  <Pill tone="rose">{r.cefr || "—"}</Pill>
                </td>
                <td className={cn(tdClass, "text-foreground")}>{r.questionCount} câu</td>
                <td className={tdClass}>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className={actionEdit}
                      aria-label={`Sửa bài ${r.title}`}
                      onClick={() => onEdit(r)}
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      className={actionDanger}
                      aria-label={`Xóa bài ${r.title}`}
                      onClick={() => onDelete(r)}
                    >
                      Xóa
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </TableShell>

      {meta && status === "ok" && (
        <AdminPagination
          meta={meta}
          count={items.length}
          noun="bài đọc"
          onPageChange={onPageChange}
        />
      )}
    </>
  );
}