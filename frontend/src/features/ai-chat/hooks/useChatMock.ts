"use client";

import { useState } from "react";
import { sendChatMessageMock } from "../api/ai-chat_mock";
import { ChatMessage } from "../types/ai-chat_types";

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Xin chào! Mình là trợ lý học tiếng Anh. Bạn có thể hỏi mình về ngữ pháp, từ vựng, cách phát âm hoặc nhờ mình sửa câu viết của bạn.",
};

export function useChatMock() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [isSending, setIsSending] = useState(false);

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || isSending) return;

    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", content }]);
    setIsSending(true);

    try {
      const reply = await sendChatMessageMock(content);
      setMessages((prev) => [...prev, reply]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: "Xin lỗi, mình chưa thể trả lời lúc này. Bạn thử gửi lại sau nhé.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return { messages, isSending, sendMessage };
}