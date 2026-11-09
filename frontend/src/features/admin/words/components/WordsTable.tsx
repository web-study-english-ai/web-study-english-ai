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
import { posShort } from "@/features/admin/shared/lib/admin_format";
import { PageMeta } from "@/features/admin/shared/types/admin_types";
import { AdminWord } from "../types/words_types";

interface Props {
  items: AdminWord[];
  meta?: PageMeta;
  status: TableStatus;
  error: unknown;
  dimmed: boolean;
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onEdit: (word: AdminWord) => void;
  onDelete: (word: AdminWord) => void;
}

export function WordsTable({
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
            <th className={thClass}>Từ vựng</th>
            <th className={thClass}>Từ loại</th>
            <th className={thClass}>Chủ đề</th>
            <th className={thClass}>Trình độ</th>
            <th className={cn(thClass, "text-right")}>Hành động</th>
          </tr>
        </thead>

        {status !== "ok" ? (
          <StateBody
            status={status}
            colSpan={6}
            error={error}
            emptyText="Không tìm thấy từ vựng phù hợp."
            onRetry={onRetry}
          />
        ) : (
          <tbody>
            {items.map((w, i) => (
              <tr key={w.id} className="border-b border-border last:border-b-0">
                <td className={cn(tdClass, "text-muted-foreground")}>{start + i + 1}</td>
                <td className={cn(tdClass, "font-semibold text-foreground")}>{w.term}</td>
                <td className={tdClass}>
                  <Pill tone="teal">{posShort(w.pos)}</Pill>
                </td>
                <td className={cn(tdClass, "text-foreground")}>{w.topic?.name ?? "—"}</td>
                <td className={tdClass}>
                  <Pill tone="rose">{w.cefr || "—"}</Pill>
                </td>
                <td className={tdClass}>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className={actionEdit}
                      aria-label={`Sửa từ ${w.term}`}
                      onClick={() => onEdit(w)}
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      className={actionDanger}
                      aria-label={`Xóa từ ${w.term}`}
                      onClick={() => onDelete(w)}
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
          noun="từ vựng"
          onPageChange={onPageChange}
        />
      )}
    </>
  );
}