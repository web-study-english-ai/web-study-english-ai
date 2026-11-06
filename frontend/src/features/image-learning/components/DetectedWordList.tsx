"use client";

import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAddCards } from "../hooks/useAddCards";
import { DetectResult } from "../types/image-learning_types";
import { formatMatchPercent } from "../utils/vision_format";

type RowStatus = "adding" | "added" | "failed";

export function DetectedWordList({ result }: { result: DetectResult }) {
  const { items, imageUrl, lowConfidence } = result;
  const add = useAddCards(imageUrl);

  // Mặc định chọn sẵn các từ chưa có trong bộ thẻ
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.filter((i) => !i.inDeck).map((i) => i.wordId))
  );
  const [status, setStatus] = useState<Record<string, RowStatus>>({});

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addIds(ids: string[]) {
    const todo = ids.filter((id) => status[id] !== "added" && status[id] !== "adding");
    if (todo.length === 0) return;

    setStatus((prev) => ({
      ...prev,
      ...Object.fromEntries(todo.map((id) => [id, "adding" as const])),
    }));
    try {
      await add.mutateAsync(todo);
      setStatus((prev) => ({
        ...prev,
        ...Object.fromEntries(todo.map((id) => [id, "added" as const])),
      }));
    } catch {
      setStatus((prev) => ({
        ...prev,
        ...Object.fromEntries(todo.map((id) => [id, "failed" as const])),
      }));
    }
  }

  const remaining = items.filter((i) => status[i.wordId] !== "added");
  const chosen = remaining.filter((i) => selected.has(i.wordId));
  const isAdding = Object.values(status).includes("adding");
  const hasFailed = Object.values(status).includes("failed");
  const allDone = remaining.length === 0;
  const bulkLabel =
    chosen.length === remaining.length ? "Thêm tất cả vào bộ thẻ" : "Thêm đã chọn vào bộ thẻ";

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
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{item.term}</span>
                  {item.pos && (
                    <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                      {item.pos}
                    </span>
                  )}
                  {item.inDeck && (
                    <span className="text-[11px] text-muted-foreground">Đã có trong bộ thẻ</span>
                  )}
                </p>
                <p className="truncate text-sm text-muted-foreground">{item.meaningVi}</p>
              </div>

              <span className="hidden rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-500 sm:inline dark:bg-rose-950/40 dark:text-rose-300">
  {formatMatchPercent(item.score)} match
</span>

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
                  {item.inDeck ? "Gắn ảnh" : "Thêm"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

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
            {isAdding ? "Đang thêm..." : bulkLabel}
          </Button>
        )}
      </div>
    </div>
  );
}