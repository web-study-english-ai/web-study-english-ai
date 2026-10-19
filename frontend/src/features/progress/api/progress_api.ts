import { apiFetch } from "@/lib/api/client";
import { ProgressStats } from "../types/progress_types";
import { mapProgressStats, RawProgressResponse } from "./progress_mapper";

export async function getProgressStats(): Promise<ProgressStats> {
  const raw = await apiFetch<RawProgressResponse>("/progress/stats");
  return mapProgressStats(raw);
}

