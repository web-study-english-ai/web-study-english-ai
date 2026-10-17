"use client";

import { ChatWindow } from "@/features/ai-chat/components/ChatWindow";
import { SuggestedTopics } from "@/features/ai-chat/components/SuggestedTopics";
import { useChatMock } from "@/features/ai-chat/hooks/useChatMock";

const SUGGESTED_TOPICS = [
  "Phân biệt Alternative và Alternate",
  "Giải thích thì Present Perfect",
  "Luyện viết câu với từ 'Implement'",
];

export default function AiChatPage() {
  const { messages, isSending, sendMessage } = useChatMock();

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="mb-4 font-heading text-2xl font-semibold text-foreground">
        Trợ lý học tiếng Anh AI
      </h1>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 gap-6 lg:grid-cols-[1fr_280px]">
        <ChatWindow messages={messages} isSending={isSending} onSend={sendMessage} />

        <div className="hidden lg:block">
          <SuggestedTopics
            topics={SUGGESTED_TOPICS}
            disabled={isSending}
            onPick={sendMessage}
          />
        </div>
      </div>
    </div>
  );
}