"use client";

import { useEffect, useRef, useState } from "react";
import { sendChatMessageMock } from "../api/ai-chat_mock";
import { ChatMessage } from "../types/ai-chat_types";

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Xin chào! Mình là trợ lý học tiếng Anh. Bạn có thể hỏi mình về ngữ pháp, từ vựng, cách phát âm hoặc nhờ mình sửa câu viết của bạn.",
};

// Tốc độ "gõ chữ" mô phỏng — API mock trả nguyên câu một lần, không phải stream thật,
// nên ta tự hiện dần ký tự ở phía client cho giống trải nghiệm streaming.
const REVEAL_CHARS_PER_TICK = 3;
const REVEAL_INTERVAL_MS = 20;

function revealContent(
  id: string,
  fullText: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  isMountedRef: React.MutableRefObject<boolean>,
): Promise<void> {
  return new Promise((resolve) => {
    let shown = 0;
    const timer = setInterval(() => {
      if (!isMountedRef.current) {
        clearInterval(timer);
        resolve();
        return;
      }
      shown = Math.min(shown + REVEAL_CHARS_PER_TICK, fullText.length);
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, content: fullText.slice(0, shown) } : m)),
      );
      if (shown >= fullText.length) {
        clearInterval(timer);
        resolve();
      }
    }, REVEAL_INTERVAL_MS);
  });
}

export function useChatMock() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [isSending, setIsSending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Dùng chung cho cả gửi mới lẫn thử lại sau khi lỗi
  async function runAssistantReply(userText: string) {
    setIsSending(true);
    try {
      const reply = await sendChatMessageMock(userText);
      const id = `a-${Date.now()}`;

      // Hiện khung trả lời trống trước, chữ sẽ chạy dần vào content
      setMessages((prev) => [...prev, { id, role: "assistant", content: "" }]);
      setStreamingId(id);
      await revealContent(id, reply.content, setMessages, isMountedRef);

      // Ví dụ & nguồn tham chiếu chỉ hiện sau khi chữ đã hiện xong hẳn
      if (isMountedRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, examples: reply.examples, sources: reply.sources } : m,
          ),
        );
      }
    } catch {
      // Lỗi thì hiện ngay, không mô phỏng gõ chữ, kèm nội dung gốc để bấm "Thử lại"
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: "Xin lỗi, mình chưa thể trả lời lúc này. Bạn thử lại nhé.",
          isError: true,
          retryText: userText,
        },
      ]);
    } finally {
      if (isMountedRef.current) {
        setStreamingId(null);
        setIsSending(false);
      }
    }
  }

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || isSending) return;

    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", content }]);
    await runAssistantReply(content);
  }

  async function retryMessage(messageId: string) {
    if (isSending) return;
    const target = messages.find((m) => m.id === messageId);
    if (!target?.retryText) return;

    // Bỏ bong bóng lỗi cũ, thử lại với đúng câu hỏi ban đầu
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    await runAssistantReply(target.retryText);
  }

  return {
    messages,
    isSending,
    isStreaming: streamingId !== null,
    sendMessage,
    retryMessage,
  };
}