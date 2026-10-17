import { apiFetch } from "@/lib/api/client";
import { ProgressStats } from "../types/progress_types";

export function getProgressStats(): Promise<ProgressStats> {
  return apiFetch<ProgressStats>("/progress/stats");
}