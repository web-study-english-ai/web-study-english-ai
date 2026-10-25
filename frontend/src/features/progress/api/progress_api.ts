import { apiFetch } from "@/lib/api/client";
import { ProgressStats, ProgressRange, DayDetail} from "../types/progress_types";
import { mapProgressStats, RawProgressResponse } from "./progress_mapper";

export async function getProgressStats(
  range: ProgressRange = "week"
): Promise<ProgressStats> {
  const raw = await apiFetch<RawProgressResponse>(`/progress/stats?range=${range}`);
  return mapProgressStats(raw);
}

export async function getDayDetail(date: string): Promise<DayDetail> {
  return apiFetch<DayDetail>(`/progress/daily?date=${date}`);
}