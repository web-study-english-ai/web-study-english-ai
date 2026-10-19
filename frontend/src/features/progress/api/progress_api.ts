import { ProgressStats } from "../types/progress_types";
import { mapProgressStats } from "./progress_mapper";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export async function getProgressStats(): Promise<ProgressStats> {
  const res = await fetch(`${API_URL}/progress/stats`, { credentials: "include" });
  if (!res.ok) throw new Error("Không thể tải thống kê tiến độ.");
  const raw = await res.json();
  return mapProgressStats(raw);
}

