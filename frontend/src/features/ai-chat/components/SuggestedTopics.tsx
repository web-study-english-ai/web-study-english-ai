interface Props {
  topics: string[];
  disabled: boolean;
  onPick: (topic: string) => void;
}

export function SuggestedTopics({ topics, disabled, onPick }: Props) {
  return (
    <aside className="rounded-2xl border border-border bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Gợi ý chủ đề hỏi đáp AI</h2>
      <div className="space-y-2">
        {topics.map((t) => (
          <button
            key={t}
            disabled={disabled}
            onClick={() => onPick(t)}
            className="w-full rounded-lg bg-muted/70 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t}
          </button>
        ))}
      </div>
    </aside>
  );
}