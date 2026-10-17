import { BookMarked, ExternalLink } from "lucide-react";
import { ChatSource } from "../types/ai-chat_types";

export function SourceList({ sources }: { sources: ChatSource[] }) {
  return (
    <div className="mt-3 border-t border-teal-200 pt-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <BookMarked className="h-3.5 w-3.5" />
        Nguồn tham chiếu
      </p>
      <ul className="flex flex-wrap gap-2">
        {sources.map((s, i) => {
          const chip = (
            <>
              <span className="text-muted-foreground">[{i + 1}]</span>
              {s.title}
              {s.url && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
            </>
          );
          const cls =
            "inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-xs text-foreground";

          return (
            <li key={s.id}>
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${cls} transition-colors hover:bg-muted`}
                >
                  {chip}
                </a>
              ) : (
                <span className={cls}>{chip}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}