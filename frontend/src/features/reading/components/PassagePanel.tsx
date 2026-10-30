import { Fragment } from "react";

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

interface Props {
  title: string;
  cefr: string;
  content: string;
}

export function PassagePanel({ title, cefr, content }: Props) {
  const paragraphs = content
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <section className="rounded-2xl border border-border bg-card p-6 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Đoạn văn đọc hiểu
        </h2>
        {cefr && (
          <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700">
            {cefr} Level
          </span>
        )}
      </div>

      <h3 className="font-heading text-xl font-bold text-foreground">{title}</h3>

      <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
        {paragraphs.map((p, i) => (
          <p key={i}>{renderInline(p)}</p>
        ))}
      </div>
    </section>
  );
}