import { Bot } from "lucide-react";
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

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-3 text-sm text-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <AssistantAvatar />
      <div className="max-w-[85%] break-words rounded-2xl rounded-tl-sm border border-teal-200 bg-teal-50/60 px-4 py-3 text-sm leading-relaxed text-foreground">
        <p className="mb-2 text-sm font-semibold text-teal-700">Trợ lý AI</p>
        <FormattedText text={message.content} />

        {message.examples && message.examples.length > 0 && (
          <div className="mt-3 rounded-xl border border-border bg-white p-3">
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