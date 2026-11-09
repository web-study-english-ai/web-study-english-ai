"use client";

import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAddCards } from "../hooks/useAddCards";
import { DetectedWord } from "../types/image-learning_types";
import { isLimitExceeded, toMatchPercent } from "../utils/vision_format";

type RowStatus = "adding" | "added" | "failed";

interface Props {
  items: DetectedWord[];
  imageUrl: string;
  lowConfidence: boolean;
  showScore?: boolean; // ẩn % match với từ do người học tự tìm
}

export function DetectedWordList({ items, imageUrl, lowConfidence, showScore = true }: Props) {
  const add = useAddCards(imageUrl);

  // Mặc định chọn sẵn các từ chưa có trong bộ thẻ
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.filter((i) => !i.inDeck).map((i) => i.wordId))
  );
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [limitPrompt, setLimitPrompt] = useState<string[] | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function patchStatus(ids: string[], next: RowStatus | null) {
    setStatus((prev) => {
      const copy = { ...prev };
      for (const id of ids) {
        if (next) copy[id] = next;
        else delete copy[id];
      }
      return copy;
    });
  }

  async function addIds(ids: string[], force = false) {
    const todo = ids.filter((id) => status[id] !== "added" && status[id] !== "adding");
    if (todo.length === 0) return;

    setNotice(null);
    setLimitPrompt(null);
    patchStatus(todo, "adding");

    try {
      const res = await add.mutateAsync({ wordIds: todo, force });
      const rejected = new Set([...res.notFound, ...res.exceededLimit]);
      patchStatus(todo.filter((id) => !rejected.has(id)), "added");
      patchStatus(todo.filter((id) => rejected.has(id)), "failed");
      setNotice(res.message || null);
    } catch (err) {
      if (isLimitExceeded(err)) {
        // BE trả 409 khi vượt hạn mức từ mới trong ngày (force = false)
        patchStatus(todo, null);
        setLimitPrompt(todo);
      } else {
        patchStatus(todo, "failed");
      }
    }
  }

  const remaining = items.filter((i) => status[i.wordId] !== "added");
  const chosen = remaining.filter((i) => selected.has(i.wordId));
  const allSelected = remaining.length > 0 && chosen.length === remaining.length;
  const isAdding = Object.values(status).includes("adding");
  const hasFailed = Object.values(status).includes("failed");
  const allDone = remaining.length === 0;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(remaining.map((i) => i.wordId)));
  }

  return (
    <div className="space-y-3">
      {lowConfidence && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Chưa chắc chắn kết quả, vui lòng chụp lại ảnh rõ hơn.
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} từ vựng</p>
        {remaining.length > 1 && (
          <button
            type="button"
            onClick={toggleAll}
            disabled={isAdding}
            className="text-sm font-medium text-teal-700 hover:underline disabled:opacity-50 dark:text-teal-300"
          >
            {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
          </button>
        )}
      </div>

      <ul className="space-y-3">
        {items.map((item) => {
          const st = status[item.wordId];
          const added = st === "added";

          return (
            <li
              key={item.wordId}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-teal-600"
                aria-label={`Chọn từ ${item.term}`}
                checked={selected.has(item.wordId)}
                disabled={added || isAdding}
                onChange={() => toggle(item.wordId)}
              />

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-foreground">{item.term}</span>
                  {item.ipa && <span className="text-xs text-muted-foreground">{item.ipa}</span>}
                  {item.pos && (
                    <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                      {item.pos}
                    </span>
                  )}
                  {item.cefr && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {item.cefr}
                    </span>
                  )}
                </p>
                <p className="truncate text-sm text-muted-foreground">{item.meaningVi}</p>
                {item.inDeck && (
                  <p className="text-[11px] text-muted-foreground">Đã có trong bộ thẻ</p>
                )}
              </div>

              {showScore && item.score !== null && (
                <span className="hidden rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-500 sm:inline dark:bg-rose-950/40 dark:text-rose-300">
                  {toMatchPercent(item.score)}% match
                </span>
              )}

              {added ? (
                <Button type="button" size="sm" variant="outline" disabled>
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Đã thêm
                </Button>
              ) : st === "adding" ? (
                <Button type="button" size="sm" variant="outline" disabled>
                  Đang thêm...
                </Button>
              ) : st === "failed" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  disabled={isAdding}
                  onClick={() => void addIds([item.wordId])}
                >
                  Thử lại
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={isAdding}
                  onClick={() => void addIds([item.wordId])}
                  className="bg-teal-600 text-white hover:bg-teal-700"
                >
                  {item.inDeck && imageUrl ? "Gắn ảnh" : "Thêm"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {limitPrompt && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <p>
            Bạn đã đạt hạn mức từ mới mỗi ngày. Bạn vẫn muốn thêm {limitPrompt.length} từ này?
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" onClick={() => void addIds(limitPrompt, true)}>
              Vẫn thêm
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setLimitPrompt(null)}>
              Hủy
            </Button>
          </div>
        </div>
      )}

      {notice && (
        <p role="status" className="text-sm text-green-600 dark:text-green-400">
          {notice}
        </p>
      )}
      {hasFailed && (
        <p role="alert" className="text-sm text-destructive">
          Không thêm được một số từ, vui lòng thử lại.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-teal-50 px-4 py-3 dark:bg-teal-950/40">
        <p className="text-sm text-teal-700 dark:text-teal-300">
          {allDone
            ? "Đã thêm tất cả từ vựng vào bộ thẻ."
            : `Đã chọn ${chosen.length} từ vựng để lưu`}
        </p>
        {!allDone && (
          <Button
            type="button"
            disabled={chosen.length === 0 || isAdding}
            onClick={() => void addIds(chosen.map((i) => i.wordId))}
            className="bg-teal-600 text-white hover:bg-teal-700"
          >
            {isAdding ? "Đang thêm..." : `Thêm đã chọn vào bộ thẻ (${chosen.length})`}
          </Button>
        )}
      </div>
    </div>
  );
}