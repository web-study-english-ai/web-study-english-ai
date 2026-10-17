import { Fragment } from "react";

export function InlineFormatted({
  text,
  boldClassName = "font-semibold",
}: {
  text: string;
  boldClassName?: string;
}) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i} className={boldClassName}>
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

export function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n").filter((line) => line.trim() !== "");

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) =>
        line.startsWith("• ") ? (
          <p key={i} className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>
              <InlineFormatted text={line.slice(2)} />
            </span>
          </p>
        ) : (
          <p key={i}>
            <InlineFormatted text={line} />
          </p>
        )
      )}
    </div>
  );
}