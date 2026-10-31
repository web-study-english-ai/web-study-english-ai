"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, X } from "lucide-react";
import { ChatWindow } from "@/features/ai-chat/components/ChatWindow";
import { useChat } from "@/features/ai-chat/hooks/useChat";

const BUTTON_SIZE = 56; // h-14 w-14
const SCREEN_MARGIN = 8;
const PANEL_GAP = 16;
// Vị trí mặc định: góc dưới phải. Mỗi lần mở khung chat sẽ nhảy về đúng vị trí này,
// dù trước đó đã kéo bong bóng đi đâu.
const DEFAULT_POSITION: Position = { right: 24, bottom: 24 };

interface Position {
  right: number;
  bottom: number;
}

// Giữ nút luôn nằm trong màn hình, kể cả khi đổi kích thước cửa sổ
function clampPosition(pos: Position): Position {
  const maxRight = Math.max(SCREEN_MARGIN, window.innerWidth - BUTTON_SIZE - SCREEN_MARGIN);
  const maxBottom = Math.max(SCREEN_MARGIN, window.innerHeight - BUTTON_SIZE - SCREEN_MARGIN);
  return {
    right: Math.min(Math.max(pos.right, SCREEN_MARGIN), maxRight),
    bottom: Math.min(Math.max(pos.bottom, SCREEN_MARGIN), maxBottom),
  };
}

export function FloatingChatBubble() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position>(DEFAULT_POSITION);
  // Gọi hook ở đây (không phải trong panel) để cuộc trò chuyện không mất khi đóng/mở lại
  const { messages, isSending, isStreaming, sendMessage, retryMessage } = useChat();

  const dragStartRef = useRef<{ x: number; y: number; right: number; bottom: number } | null>(null);
  const wasDraggedRef = useRef(false);

  useEffect(() => {
    function handleResize() {
      setPosition((p) => clampPosition(p));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (open) return; // đang mở khung chat: khóa vị trí, không cho kéo
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { x: e.clientX, y: e.clientY, right: position.right, bottom: position.bottom };
    wasDraggedRef.current = false;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const start = dragStartRef.current;
    if (!start || open) return; // đang mở khung chat: khóa vị trí, không cho kéo

    const deltaX = e.clientX - start.x;
    const deltaY = e.clientY - start.y;

    // Chỉ coi là kéo khi di chuyển đủ xa, tránh nhầm một cú bấm tay run thành kéo
    if (!wasDraggedRef.current && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
      wasDraggedRef.current = true;
    }
    if (!wasDraggedRef.current) return;

    setPosition(clampPosition({ right: start.right - deltaX, bottom: start.bottom - deltaY }));
  }

  function handlePointerUp() {
    dragStartRef.current = null;
    // wasDraggedRef giữ nguyên để handleClick (chạy ngay sau đó) biết mà bỏ qua
  }

  function handleClick() {
    if (wasDraggedRef.current) {
      wasDraggedRef.current = false;
      return;
    }
    if (!open) {
      // Mở lên thì luôn về đúng góc dưới phải, dù trước đó đã kéo đi đâu
      setPosition(DEFAULT_POSITION);
    }
    setOpen((v) => !v);
  }

  const panelStyle = {
    right: position.right,
    bottom: position.bottom + BUTTON_SIZE + PANEL_GAP,
  };

  return (
    <>
      {open && (
        <div
          style={panelStyle}
          className="fixed z-50 flex h-[32rem] max-h-[calc(100vh-8rem)] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl shadow-2xl"
        >
          <div className="flex items-center justify-between rounded-t-2xl bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <span className="font-heading text-sm font-semibold">
                Trợ lý học tiếng Anh AI
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Đóng trợ lý AI"
              className="rounded-full p-1 text-primary-foreground/80 hover:bg-card/10 hover:text-primary-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Bỏ bo góc/viền sẵn có của ChatWindow vì panel đã có khung riêng */}
          <div className="min-h-0 flex-1 bg-card [&>div]:rounded-none [&>div]:border-0">
            <ChatWindow
              messages={messages}
              isSending={isSending}
              isStreaming={isStreaming}
              onSend={sendMessage}
              onRetryMessage={retryMessage}
            />
          </div>
        </div>
      )}

      <button
        style={{ right: position.right, bottom: position.bottom }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
        aria-label={open ? "Đóng trợ lý AI" : "Mở trợ lý AI"}
        className={`fixed z-50 flex h-14 w-14 touch-none select-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform ${
          open ? "" : "active:cursor-grabbing active:scale-95"
        }`}
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>
    </>
  );
}