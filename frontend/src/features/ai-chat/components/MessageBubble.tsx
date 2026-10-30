import { Bot, RotateCcw } from "lucide-react";
import { ChatMessage } from "../types/ai-chat_types";
import { FormattedText, InlineFormatted } from "./FormattedText";
import { SourceList } from "./SourceList";

export function AssistantAvatar() {
  return (
    <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <Bot className="h-4 w-4" />
    </span>
  );
}

interface Props {
  message: ChatMessage;
  onRetry?: () => void;
}

export function MessageBubble({ message, onRetry }: Props) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-3 text-sm text-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.isError) {
    return (
      <div className="flex items-start gap-3">
        <AssistantAvatar />
        <div className="max-w-[85%] break-words rounded-2xl rounded-tl-sm border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <p>{message.content}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1 rounded-full border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <RotateCcw className="h-3 w-3" />
              Thử lại
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <AssistantAvatar />
      <div className="max-w-[85%] break-words rounded-2xl rounded-tl-sm border border-teal-200 bg-teal-50/60 dark:border-teal-800 dark:bg-teal-950/30 px-4 py-3 text-sm leading-relaxed text-foreground">
        <p className="mb-2 text-sm font-semibold text-teal-700 dark:text-teal-300">Trợ lý AI</p>
        <FormattedText text={message.content} />

        {message.examples && message.examples.length > 0 && (
          <div className="mt-3 rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-semibold text-teal-700">Ví dụ chi tiết</p>
            <ol className="mt-2 space-y-2">
              {message.examples.map((ex, i) => (
                <li key={i} className="text-xs">
                  <p>
                    <span className="font-medium">
                      {i + 1}. {ex.label}:
                    </span>{" "}
                    <InlineFormatted text={ex.en} boldClassName="font-semibold text-rose-500" />
                  </p>
                  <p className="text-muted-foreground">({ex.vi})</p>
                </li>
              ))}
            </ol>
          </div>
        )}

        {message.sources && message.sources.length > 0 && (
          <SourceList sources={message.sources} />
        )}
      </div>
    </div>
  );
}