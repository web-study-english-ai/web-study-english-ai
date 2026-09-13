"use client";

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
}

export function VocabularyResultItem({ item, isActive, isAdded, onSelect, onAdd }: Props) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-colors",
        isActive ? "border-primary bg-primary/5" : "border-border bg-white hover:bg-muted/50"
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
    </div>
  );
}