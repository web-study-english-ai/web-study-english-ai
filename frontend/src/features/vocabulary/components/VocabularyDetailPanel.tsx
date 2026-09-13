"use client";

import { X, Volume2 } from "lucide-react";
import { useWordDetail } from "../hooks/useWordDetail";
import { POS_LABEL } from "../types/vocabulary_types";

interface Props {
  wordId: string | null;
  onClose?: () => void;
}

export function VocabularyDetailPanel({ wordId, onClose }: Props) {
  const { data: item, isLoading } = useWordDetail(wordId);

  if (!wordId) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Chọn 1 từ để xem chi tiết
      </div>
    );
  }

  if (isLoading || !item) {
    return (
      <div className="rounded-xl border border-border bg-white p-5 text-sm text-muted-foreground">
        Đang tải chi tiết…
      </div>
    );
  }

  const ipa = item.pronunciation.phoneticText ?? item.ipa;

  function phatAm() {
    if (item!.pronunciation.audioUrl) {
      void new Audio(item!.pronunciation.audioUrl).play();
      return;
    }
    const utter = new SpeechSynthesisUtterance(item!.term);
    utter.lang = "en-US";
    window.speechSynthesis.speak(utter);
  }

  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="mb-3 flex items-start justify-between">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          Chi tiết từ vựng
        </p>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <h2 className="font-heading text-2xl font-bold text-foreground">{item.term}</h2>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
          {POS_LABEL[item.pos]}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          {item.cefr}
        </span>
      </div>

      {ipa && (
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          {ipa}
          <button onClick={phatAm} className="text-primary" aria-label="Phát âm">
            <Volume2 className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Nghĩa tiếng Việt</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground">{item.meaningVi}</p>
      </div>

      {item.pronunciation.definitions.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Định nghĩa tiếng Anh
          </p>
          <ul className="mt-1 space-y-1">
            {item.pronunciation.definitions.slice(0, 3).map((d, i) => (
              <li key={i} className="text-sm leading-relaxed text-foreground">
                {d.definition}
              </li>
            ))}
          </ul>
        </div>
      )}

      {item.exampleEn && (
        <div className="mt-4 rounded-lg bg-muted/60 p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Ví dụ thực tế</p>
          <p className="mt-1 text-sm italic text-foreground">&ldquo;{item.exampleEn}&rdquo;</p>
        </div>
      )}
    </div>
  );
}