"use client";

import { cn } from "@/lib/utils";
import { AdminPagination } from "@/features/admin/shared/components/AdminPagination";
import {
  actionDanger,
  actionEdit,
  actionSuccess,
  Pill,
  StateBody,
  TableShell,
  TableStatus,
  tdClass,
  thClass,
} from "@/features/admin/shared/components/AdminTableParts";
import { formatDate, roleLabel } from "@/features/admin/shared/lib/admin_format";
import { PageMeta } from "@/features/admin/shared/types/admin_types";
import { AdminUser } from "../types/users_types";

interface Props {
  items: AdminUser[];
  meta?: PageMeta;
  status: TableStatus;
  error: unknown;
  dimmed: boolean;
  currentUserId?: string;
  busyId: string | null; // dòng đang được cập nhật
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onEdit: (user: AdminUser) => void;
  onLock: (user: AdminUser) => void;
  onUnlock: (user: AdminUser) => void;
}

export function UsersTable({
  items,
  meta,
  status,
  error,
  dimmed,
  currentUserId,
  busyId,
  onRetry,
  onPageChange,
  onEdit,
  onLock,
  onUnlock,
}: Props) {
  const start = meta ? (meta.page - 1) * meta.limit : 0;

  return (
    <>
      <TableShell dimmed={dimmed}>
        <thead className="border-b border-border">
          <tr>
            <th className={thClass}>STT</th>
            <th className={thClass}>Tài khoản</th>
            <th className={thClass}>Vai trò</th>
            <th className={thClass}>Ngày tạo</th>
            <th className={thClass}>Trạng thái</th>
            <th className={cn(thClass, "text-right")}>Hành động</th>
          </tr>
        </thead>

        {status !== "ok" ? (
          <StateBody
            status={status}
            colSpan={6}
            error={error}
            emptyText="Không tìm thấy tài khoản phù hợp."
            onRetry={onRetry}
          />
        ) : (
          <tbody>
            {items.map((u, i) => {
              const isSelf = u.id === currentUserId;
              const busy = busyId === u.id;

              return (
                <tr key={u.id} className="border-b border-border last:border-b-0">
                  <td className={cn(tdClass, "text-muted-foreground")}>{start + i + 1}</td>
                  <td className={tdClass}>
                    <p className="font-semibold text-foreground">
                      {u.fullName || "—"}
                      {isSelf && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          (Bạn)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </td>
                  <td className={cn(tdClass, "text-foreground")}>{roleLabel(u.role)}</td>
                  <td className={cn(tdClass, "text-foreground")}>{formatDate(u.createdAt)}</td>
                  <td className={tdClass}>
                    <Pill tone={u.isActive ? "green" : "red"}>
                      {u.isActive ? "Hoạt động" : "Đã khóa"}
                    </Pill>
                  </td>
                  <td className={tdClass}>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className={actionEdit}
                        disabled={busy}
                        aria-label={`Sửa tài khoản ${u.fullName || u.email}`}
                        onClick={() => onEdit(u)}
                      >
                        Sửa
                      </button>

                      {u.isActive ? (
                        <button
                          type="button"
                          className={actionDanger}
                          disabled={isSelf || busy}
                          title={isSelf ? "Bạn không thể khóa chính mình" : undefined}
                          aria-label={`Khóa tài khoản ${u.fullName || u.email}`}
                          onClick={() => onLock(u)}
                        >
                          Khóa
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={actionSuccess}
                          disabled={busy}
                          aria-label={`Mở khóa tài khoản ${u.fullName || u.email}`}
                          onClick={() => onUnlock(u)}
                        >
                          Mở khóa
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        )}
      </TableShell>

      {meta && status === "ok" && (
        <AdminPagination
          meta={meta}
          count={items.length}
          noun="tài khoản"
          onPageChange={onPageChange}
        />
      )}
    </>
  );
}