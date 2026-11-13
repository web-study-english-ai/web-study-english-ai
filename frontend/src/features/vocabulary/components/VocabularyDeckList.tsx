"use client";

import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { POS_LABEL, DeckCard, isCardLearned } from "../types/vocabulary_types";
import { CardImage } from "@/components/shared/CardImage";

interface Props {
  deck: DeckCard[];
  selected: DeckCard | null;
  onSelect: (card: DeckCard) => void;
  onRemove: (cardId: string) => void;
  /** Thông báo khi danh sách rỗng, mặc định là "bộ thẻ đang trống" */
  emptyMessage?: string;
}

export function VocabularyDeckList({ deck, selected, onSelect, onRemove, emptyMessage }: Props) {
  if (deck.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <p className="text-sm text-muted-foreground">
          {emptyMessage ?? "Bộ thẻ của bạn đang trống. Hãy tìm và thêm từ vựng ở tab bên cạnh."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {deck.map((item) => {
        const learned = isCardLearned(item);

        return (
          <div
            key={item.id}
            onClick={() => onSelect(item)}
            className={cn(
              "flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-colors",
              selected?.id === item.id
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:bg-muted/50"
            )}
          >
            <div className="flex items-center gap-3">
              <CardImage
                src={item.imageUrl}
                alt={item.word.term}
                className="h-14 w-14 shrink-0 rounded-lg"
              />
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">{item.word.term}</p>
                  <Badge variant="secondary" className="text-xs">{POS_LABEL[item.word.pos]}</Badge>
                  <span className="text-xs text-muted-foreground">{item.word.ipa}</span>
                </div>
                <p className="text-sm text-muted-foreground">{item.word.meaningVi}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  learned
                    ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                    : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                )}
              >
                {learned ? "Đã học" : "Chưa học"}
              </span>

              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.id);
                }}
                aria-label="Xóa khỏi bộ thẻ"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}