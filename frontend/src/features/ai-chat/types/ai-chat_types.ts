export type ChatRole = "user" | "assistant";

// Khớp response thật của backend: sources: [{ id, source, topic }]
export interface ChatSource {
  id: string;
  source: string;
  topic: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string; // hỗ trợ **in đậm** và dòng bắt đầu bằng "• "
  sources?: ChatSource[];
  degraded?: boolean; // true khi AI chưa sinh được câu trả lời (chỉ có tài liệu liên quan)
  isError?: boolean;
  retryText?: string;
  retryEventId?: string; // giữ nguyên clientEventId khi thử lại để backend chống trùng
}

// POST /api/assistant/ask
export interface AskRequest {
  question: string;
  conversationId?: string;
  clientEventId?: string;
}

export interface AskResponse {
  answer: string;
  sources: ChatSource[];
  degraded: boolean;
  conversationId: string | null;
}