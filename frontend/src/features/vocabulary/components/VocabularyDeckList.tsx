"use client";

import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { POS_LABEL, DeckCard } from "../types/vocabulary_types";

interface Props {
  deck: DeckCard[];
  selected: DeckCard | null;
  onSelect: (card: DeckCard) => void;
  onRemove: (cardId: string) => void;
}

export function VocabularyDeckList({ deck, selected, onSelect, onRemove }: Props) {
  if (deck.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Bộ thẻ của bạn đang trống. Hãy tìm và thêm từ vựng ở tab bên cạnh.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {deck.map((item) => (
        <div
          key={item.id}
          onClick={() => onSelect(item)}
          className={cn(
            "flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-colors",
            selected?.id === item.id
              ? "border-primary bg-primary/5"
              : "border-border bg-white hover:bg-muted/50"
          )}
        >
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-foreground">{item.word.term}</p>
              <Badge variant="secondary" className="text-xs">{POS_LABEL[item.word.pos]}</Badge>
              <span className="text-xs text-muted-foreground">{item.word.ipa}</span>
            </div>
              <p className="text-sm text-muted-foreground">{item.word.meaningVi}</p>
          </div>

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
      ))}
    </div>
  );
}