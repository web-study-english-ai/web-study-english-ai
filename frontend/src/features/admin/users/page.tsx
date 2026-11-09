"use client";

import { useState } from "react";
import { PageContainer } from "@/components/shared/PageContainer";
import { AdminTabs } from "@/features/admin/shared/components/AdminTabs";
import { AdminNotice } from "@/features/admin/shared/components/AdminNotice";
import { ConfirmDialog } from "@/features/admin/shared/components/ConfirmDialog";
import { AdminSearchInput, AdminSelect } from "@/features/admin/shared/components/AdminFilters";
import { tableStatus } from "@/features/admin/shared/components/AdminTableParts";
import { useListState } from "@/features/admin/shared/hooks/useListState";
import { useNotice } from "@/features/admin/shared/hooks/useNotice";
import { errorMessage } from "@/features/admin/shared/lib/admin_errors";
import { ROLE_OPTIONS, roleLabel } from "@/features/admin/shared/lib/admin_format";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { useAdminUsers, useUpdateUser } from "@/features/admin/users/hooks/useAdminUsers";
import { UsersTable } from "@/features/admin/users/components/UsersTable";
import { UserEditDialog } from "@/features/admin/users/components/UserEditDialog";
import { AdminUser, UpdateUserBody } from "@/features/admin/users/types/users_types";

const PAGE_SIZE = 10;
const ROLE_FILTER = ROLE_OPTIONS.map((v) => ({ value: v, label: roleLabel(v) }));
const STATUS_FILTER = [
  { value: "ACTIVE", label: "Hoạt động" },
  { value: "LOCKED", label: "Đã khóa" },
];

export default function AdminUsersPage() {
  const me = useCurrentUser();
  const list = useListState({ role: "all", status: "all" });
  const query = useAdminUsers({
    page: list.page,
    limit: PAGE_SIZE,
    search: list.search,
    role: list.filters.role,
    status: list.filters.status,
  });
  const update = useUpdateUser();
  const { notice, show, clear } = useNotice();

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [locking, setLocking] = useState<AdminUser | null>(null);

  const items = query.data?.items ?? [];
  const status = tableStatus(query.isLoading, query.isError, items.length);
  const busyId = update.isPending ? (update.variables?.id ?? null) : null;
  const display = (u: AdminUser) => u.fullName || u.email;

  function openEdit(user: AdminUser) {
    update.reset();
    setEditing(user);
  }

  function openLock(user: AdminUser) {
    update.reset();
    setLocking(user);
  }

  function handleEdit(body: UpdateUserBody) {
    if (!editing) return;
    update.mutate(
      { id: editing.id, body },
      {
        onSuccess: () => {
          setEditing(null);
          show("success", "Đã cập nhật tài khoản.");
        },
      }
    );
  }

  function handleLock() {
    if (!locking) return;
    const target = locking;
    update.mutate(
      { id: target.id, body: { isActive: false } },
      {
        onSuccess: () => {
          setLocking(null);
          show("success", `Đã khóa tài khoản ${display(target)}.`);
        },
      }
    );
  }

  function handleUnlock(user: AdminUser) {
    update.mutate(
      { id: user.id, body: { isActive: true } },
      {
        onSuccess: () => show("success", `Đã mở khóa tài khoản ${display(user)}.`),
        onError: (err) =>
          show("error", errorMessage(err, "Không mở khóa được tài khoản, vui lòng thử lại.")),
      }
    );
  }

  return (
    <PageContainer>
      <div className="space-y-5">
        <AdminTabs />
        <AdminNotice notice={notice} onClose={clear} />

        <div className="flex flex-wrap items-center gap-3">
          <AdminSearchInput
            value={list.searchInput}
            onChange={list.onSearchChange}
            placeholder="Tìm kiếm tên hoặc email..."
          />
          <AdminSelect
            label="Vai trò"
            value={list.filters.role}
            onChange={(v) => list.onFilterChange("role", v)}
            options={ROLE_FILTER}
          />
          <AdminSelect
            label="Trạng thái"
            value={list.filters.status}
            onChange={(v) => list.onFilterChange("status", v)}
            options={STATUS_FILTER}
          />
        </div>

        <UsersTable
          items={items}
          meta={query.data?.meta}
          status={status}
          error={query.error}
          dimmed={query.isPlaceholderData}
          currentUserId={me?.id}
          busyId={busyId}
          onRetry={() => void query.refetch()}
          onPageChange={list.setPage}
          onEdit={openEdit}
          onLock={openLock}
          onUnlock={handleUnlock}
        />
      </div>

      {editing && (
        <UserEditDialog
          key={editing.id}
          user={editing}
          isSelf={editing.id === me?.id}
          pending={update.isPending}
          errorText={
            update.isError
              ? errorMessage(update.error, "Không lưu được thay đổi, vui lòng thử lại.")
              : null
          }
          onSubmit={handleEdit}
          onClose={() => setEditing(null)}
        />
      )}

      {locking && (
        <ConfirmDialog
          title="Khóa tài khoản?"
          description={`Bạn sắp khóa tài khoản ${display(locking)}. Bạn có thể mở khóa lại bất cứ lúc nào.`}
          confirmLabel="Khóa tài khoản"
          destructive
          pending={update.isPending}
          errorText={
            update.isError
              ? errorMessage(update.error, "Không khóa được tài khoản, vui lòng thử lại.")
              : null
          }
          onConfirm={handleLock}
          onCancel={() => setLocking(null)}
        />
      )}
    </PageContainer>
  );
}