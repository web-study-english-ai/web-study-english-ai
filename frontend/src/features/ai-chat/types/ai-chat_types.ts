export type ChatRole = "user" | "assistant";

export interface ChatSource {
  id: string;
  title: string;
  url?: string;
}

export interface ChatExample {
  label: string; // ví dụ: "Verb (Affect)"
  en: string; // dùng **từ** để tô đỏ từ cần nhấn mạnh
  vi: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string; // hỗ trợ **in đậm** và dòng bắt đầu bằng "• "
  examples?: ChatExample[];
  sources?: ChatSource[];
    isError?: boolean;
  retryText?: string;
}