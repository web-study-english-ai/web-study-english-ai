import { Bot, RotateCcw } from "lucide-react";
import { ChatMessage } from "../types/ai-chat_types";
import { FormattedText } from "./FormattedText";
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

        {message.degraded && (
          <p className="mt-2 text-xs italic text-muted-foreground">
            Trợ lý đang bận, đây là tài liệu liên quan
          </p>
        )}

        {message.sources && message.sources.length > 0 && (
          <SourceList sources={message.sources} />
        )}
      </div>
    </div>
  );
}