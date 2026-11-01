import { apiFetch } from "@/lib/api/client";
import { AskRequest, AskResponse } from "../types/ai-chat_types";

// apiFetch tự gắn Bearer token, tự làm mới phiên và ném ApiError khi lỗi,
// giống cách auth_api.ts đang gọi "/auth/login".
export function askAssistant(params: AskRequest, signal?: AbortSignal): Promise<AskResponse> {
  return apiFetch<AskResponse>("/assistant/ask", {
    method: "POST",
    body: JSON.stringify(params),
    signal,
  });
}