import { ProgressStats } from "../types/progress_types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export async function getProgressStats(): Promise<ProgressStats> {
  const res = await fetch(`${API_URL}/progress/stats`, {
    credentials: "include", // gửi kèm cookie refresh token
  });
  if (!res.ok) throw new Error("Không thể tải thống kê tiến độ.");
  return res.json();
}