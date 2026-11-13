"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { POS_LABEL, VocabularyItem } from "../types/vocabulary_types";

interface Props {
  item: VocabularyItem;
  isActive: boolean;
  isAdded: boolean;
  onSelect: () => void;
  onAdd: () => void;
  /** Xóa từ này khỏi bộ thẻ, chỉ hiện khi isAdded */
  onRemove?: () => Promise<void> | void;
}

export function VocabularyResultItem({
  item,
  isActive,
  isAdded,
  onSelect,
  onAdd,
  onRemove,
}: Props) {
  const [removing, setRemoving] = useState(false);

  async function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (removing || !onRemove) return;
    setRemoving(true);
    try {
      await onRemove();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-colors",
        isActive ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/50"
      )}
    >
      <div className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground">{item.term}</p>
            <Badge variant="secondary" className="text-xs">{POS_LABEL[item.pos]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{item.meaningVi}</p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant={isAdded ? "secondary" : "outline"}
          disabled={isAdded}
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className={isAdded ? "" : "text-primary"}
        >
          {isAdded ? "Đã thêm" : "Thêm vào bộ thẻ"}
        </Button>

        {isAdded && onRemove && (
          <Button
            size="icon"
            variant="ghost"
            disabled={removing}
            onClick={(e) => void handleRemove(e)}
            className="h-8 w-8 text-destructive hover:bg-destructive/10"
            aria-label={`Xóa ${item.term} khỏi bộ thẻ`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}