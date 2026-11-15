"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { AdminTabs } from "@/features/admin/shared/components/AdminTabs";
import { AdminNotice } from "@/features/admin/shared/components/AdminNotice";
import { ConfirmDialog } from "@/features/admin/shared/components/ConfirmDialog";
import {
  AdminSearchInput,
  AdminSelect,
} from "@/features/admin/shared/components/AdminFilters";
import { tableStatus } from "@/features/admin/shared/components/AdminTableParts";
import { useListState } from "@/features/admin/shared/hooks/useListState";
import { useNotice } from "@/features/admin/shared/hooks/useNotice";
import { errorMessage } from "@/features/admin/shared/lib/admin_errors";
import { ADMIN_CEFR } from "@/features/admin/shared/lib/admin_format";
import {
  useAdminReadings,
  useDeleteReading,
  useReadingTopics,
  useUpdateReading,
} from "@/features/admin/reading/hooks/useAdminReading";
import { ReadingAdminTable } from "@/features/admin/reading/components/ReadingAdminTable";
import { ReadingEditDialog } from "@/features/admin/reading/components/ReadingEditDialog";
import {
  AdminReading,
  UpdateReadingBody,
} from "@/features/admin/reading/types/reading_admin_types";

const PAGE_SIZE = 10;
const CEFR_OPTIONS = ADMIN_CEFR.map((v) => ({ value: v, label: v }));

export default function AdminReadingPage() {
  const list = useListState({ topic: "all", cefr: "all" });
  const query = useAdminReadings({
    page: list.page,
    limit: PAGE_SIZE,
    search: list.search,
    topic: list.filters.topic,
    cefr: list.filters.cefr,
  });
  const topics = useReadingTopics();
  const update = useUpdateReading();
  const remove = useDeleteReading();
  const { notice, show, clear } = useNotice();

  const [editing, setEditing] = useState<AdminReading | null>(null);
  const [deleting, setDeleting] = useState<AdminReading | null>(null);

  const items = query.data?.items ?? [];
  const status = tableStatus(query.isLoading, query.isError, items.length);

  function openEdit(reading: AdminReading) {
    update.reset();
    setEditing(reading);
  }

  function openDelete(reading: AdminReading) {
    remove.reset();
    setDeleting(reading);
  }

  function handleUpdate(body: UpdateReadingBody) {
    if (!editing) return;
    update.mutate(
      { id: editing.id, body },
      {
        onSuccess: () => {
          setEditing(null);
          show("success", "Đã cập nhật bài đọc.");
        },
      }
    );
  }

  function handleDelete() {
    if (!deleting) return;
    const target = deleting;
    remove.mutate(target.id, {
      onSuccess: () => {
        setDeleting(null);
        if (items.length === 1 && list.page > 1) list.setPage(list.page - 1);
        show("success", `Đã xóa bài đọc “${target.title}”.`);
      },
    });
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
            placeholder="Tìm kiếm bài đọc..."
          />
          <AdminSelect
            label="Chủ đề"
            value={list.filters.topic}
            onChange={(v) => list.onFilterChange("topic", v)}
            options={(topics.data ?? []).map((t) => ({ value: t, label: t }))}
          />
          <AdminSelect
            label="Trình độ"
            value={list.filters.cefr}
            onChange={(v) => list.onFilterChange("cefr", v)}
            options={CEFR_OPTIONS}
          />
          <Link
            href="/admin/reading/create"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Thêm bài đọc
          </Link>
        </div>

        <ReadingAdminTable
          items={items}
          meta={query.data?.meta}
          status={status}
          error={query.error}
          dimmed={query.isPlaceholderData}
          onRetry={() => void query.refetch()}
          onPageChange={list.setPage}
          onEdit={openEdit}
          onDelete={openDelete}
        />
      </div>

      {editing && (
        <ReadingEditDialog
          key={editing.id}
          reading={editing}
          topics={topics.data ?? []}
          pending={update.isPending}
          errorText={
            update.isError
              ? errorMessage(update.error, "Không lưu được thay đổi, vui lòng thử lại.")
              : null
          }
          onSubmit={handleUpdate}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Xóa bài đọc?"
          description={`Bạn sắp xóa bài “${deleting.title}”. Hành động này không thể hoàn tác.`}
          confirmLabel="Xóa"
          destructive
          pending={remove.isPending}
          errorText={
            remove.isError
              ? errorMessage(remove.error, "Không xóa được bài đọc, vui lòng thử lại.")
              : null
          }
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </PageContainer>
  );
}