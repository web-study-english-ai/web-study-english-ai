"use client";

import { useEffect, useRef } from "react";
import { ChatMessage } from "../types/ai-chat_types";
import { AssistantAvatar, MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";

interface Props {
  messages: ChatMessage[];
  isSending: boolean;
  onSend: (text: string) => void;
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3" aria-label="Trợ lý đang trả lời">
      <AssistantAvatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-teal-200 bg-teal-50/60 px-4 py-3.5">
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

export function ChatWindow({ messages, isSending, onSend }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isSending]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-white">
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        className="flex-1 space-y-5 overflow-y-auto p-5"
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {isSending && <TypingIndicator />}
      </div>
      <ChatInput disabled={isSending} onSend={onSend} />
    </div>
  );
}