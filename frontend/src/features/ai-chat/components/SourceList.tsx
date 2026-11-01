import { BookMarked } from "lucide-react";
import { ChatSource } from "../types/ai-chat_types";

export function SourceList({ sources }: { sources: ChatSource[] }) {
  return (
    <div className="mt-3 border-t border-teal-200 pt-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <BookMarked className="h-3.5 w-3.5" />
        Nguồn tham chiếu
      </p>
      <ul className="flex flex-wrap gap-2">
        {sources.map((s, i) => (
          <li key={s.id}>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground">
              <span className="text-muted-foreground">[{i + 1}]</span>
              {s.source}
              {s.topic && <span className="text-muted-foreground">· {s.topic}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}