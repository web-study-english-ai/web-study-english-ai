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
  useAdminWords,
  useDeleteWord,
  useUpdateWord,
  useWordTopics,
} from "@/features/admin/words/hooks/useAdminWords";
import { WordsTable } from "@/features/admin/words/components/WordsTable";
import { WordEditDialog } from "@/features/admin/words/components/WordEditDialog";
import { AdminWord, UpdateWordBody } from "@/features/admin/words/types/words_types";

const PAGE_SIZE = 10;
const CEFR_OPTIONS = ADMIN_CEFR.map((v) => ({ value: v, label: v }));

export default function AdminWordsPage() {
  const list = useListState({ topicId: "all", cefr: "all" });
  const query = useAdminWords({
    page: list.page,
    limit: PAGE_SIZE,
    search: list.search,
    topicId: list.filters.topicId,
    cefr: list.filters.cefr,
  });
  const topics = useWordTopics();
  const update = useUpdateWord();
  const remove = useDeleteWord();
  const { notice, show, clear } = useNotice();

  const [editing, setEditing] = useState<AdminWord | null>(null);
  const [deleting, setDeleting] = useState<AdminWord | null>(null);

  const items = query.data?.items ?? [];
  const status = tableStatus(query.isLoading, query.isError, items.length);

  function openEdit(word: AdminWord) {
    update.reset();
    setEditing(word);
  }

  function openDelete(word: AdminWord) {
    remove.reset();
    setDeleting(word);
  }

  function handleUpdate(body: UpdateWordBody) {
    if (!editing) return;
    update.mutate(
      { id: editing.id, body },
      {
        onSuccess: () => {
          setEditing(null);
          show("success", "Đã cập nhật từ vựng.");
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
        // Xóa dòng cuối của trang thì lùi về trang trước
        if (items.length === 1 && list.page > 1) list.setPage(list.page - 1);
        show("success", `Đã xóa từ vựng “${target.term}”.`);
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
            placeholder="Tìm kiếm từ vựng..."
          />
          <AdminSelect
            label="Chủ đề"
            value={list.filters.topicId}
            onChange={(v) => list.onFilterChange("topicId", v)}
            options={(topics.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          />
          <AdminSelect
            label="Trình độ"
            value={list.filters.cefr}
            onChange={(v) => list.onFilterChange("cefr", v)}
            options={CEFR_OPTIONS}
          />
          <Link
            href="/admin/words/import"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Nạp dữ liệu
          </Link>
        </div>

        <WordsTable
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
        <WordEditDialog
          key={editing.id}
          word={editing}
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
          title="Xóa từ vựng?"
          description={`Bạn sắp xóa từ “${deleting.term}”. Hành động này không thể hoàn tác.`}
          confirmLabel="Xóa"
          destructive
          pending={remove.isPending}
          errorText={
            remove.isError
              ? errorMessage(remove.error, "Không xóa được từ vựng, vui lòng thử lại.")
              : null
          }
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </PageContainer>
  );
}