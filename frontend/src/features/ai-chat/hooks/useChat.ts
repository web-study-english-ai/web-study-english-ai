"use client";

import { useEffect, useRef, useState } from "react";
import { askAssistant } from "../api/ai-chat";
import { ChatMessage } from "../types/ai-chat_types";

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Xin chào! Mình là trợ lý học tiếng Anh. Bạn có thể hỏi mình về ngữ pháp, từ vựng, cách phát âm hoặc nhờ mình sửa câu viết của bạn.",
};

// Backend (bản JSON) trả nguyên câu một lần, nên ta hiện dần ký tự ở client cho giống streaming.
// Khi chuyển sang /ask/stream thì thay revealContent bằng việc đọc SSE thật.
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

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [isSending, setIsSending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);

  // Giữ mạch hội thoại: lấy từ lượt trả lời trước, gửi lại ở lượt sau
  const conversationIdRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Dùng chung cho cả gửi mới lẫn thử lại sau khi lỗi
  async function runAssistantReply(userText: string, clientEventId: string) {
    setIsSending(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const reply = await askAssistant(
        { question: userText, conversationId: conversationIdRef.current, clientEventId },
        controller.signal,
      );
      if (!isMountedRef.current) return;

      if (reply.conversationId) conversationIdRef.current = reply.conversationId;

      const id = `a-${Date.now()}`;
      setMessages((prev) => [...prev, { id, role: "assistant", content: "" }]);
      setStreamingId(id);
      await revealContent(id, reply.answer, setMessages, isMountedRef);

      // Nguồn tham chiếu chỉ hiện sau khi chữ đã hiện xong hẳn
      if (isMountedRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, sources: reply.sources, degraded: reply.degraded } : m,
          ),
        );
      }
    } catch {
      if (controller.signal.aborted || !isMountedRef.current) return;
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: "Xin lỗi, mình chưa thể trả lời lúc này. Bạn thử lại nhé.",
          isError: true,
          retryText: userText,
          retryEventId: clientEventId,
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
    await runAssistantReply(content, crypto.randomUUID());
  }

  async function retryMessage(messageId: string) {
    if (isSending) return;
    const target = messages.find((m) => m.id === messageId);
    if (!target?.retryText) return;

    // Bỏ bong bóng lỗi cũ, thử lại với đúng câu hỏi và cùng clientEventId
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    await runAssistantReply(target.retryText, target.retryEventId ?? crypto.randomUUID());
  }

  return {
    messages,
    isSending,
    isStreaming: streamingId !== null,
    sendMessage,
    retryMessage,
  };
}