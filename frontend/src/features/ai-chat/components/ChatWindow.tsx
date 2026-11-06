"use client";

import { useEffect, useRef } from "react";
import { ChatMessage } from "../types/ai-chat_types";
import { AssistantAvatar, MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { SuggestedTopics } from "./SuggestedTopics";

const SUGGESTED_TOPICS = [
  "Phân biệt Alternative và Alternate",
  "Giải thích thì Present Perfect",
  "Luyện viết câu với từ 'Implement'",
];

interface Props {
  messages: ChatMessage[];
  isSending: boolean;
  isStreaming: boolean;
  onSend: (text: string) => void;
  onRetryMessage: (messageId: string) => void;
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3" aria-label="Trợ lý đang trả lời">
      <AssistantAvatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-teal-200 bg-teal-50/60 dark:border-teal-800 dark:bg-teal-950/30 px-4 py-3.5">
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-600/60"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function ChatWindow({ messages, isSending, isStreaming, onSend, onRetryMessage }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isSending]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card">
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5"
      >
        {/* Gợi ý chủ đề nằm chung vùng cuộn với tin nhắn, không chiếm riêng một khối cố định
            phía trên — tránh đẩy khung chat co nhỏ lại thành một khe hẹp */}
        {messages.length === 1 && (
          <SuggestedTopics topics={SUGGESTED_TOPICS} disabled={isSending} onPick={onSend} />
        )}

        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onRetry={m.isError ? () => onRetryMessage(m.id) : undefined}
          />
        ))}
        {isSending && !isStreaming && <TypingIndicator />}
      </div>
      <ChatInput disabled={isSending} onSend={onSend} />
    </div>
  );
}