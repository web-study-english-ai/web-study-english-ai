export interface AdminReading {
  id: string;
  code: string; // "BD001"
  slug: string;
  title: string;
  summary: string;
  topic: string;
  cefr: string;
  wordCount: number;
  estimatedMinutes: number;
  questionCount: number;
  createdAt: string;
}

export interface ReadingListParams {
  page: number;
  limit: number;
  search: string;
  topic: string; // "all" = không lọc
  cefr: string; // "all" = không lọc
}

/** @deprecated Dùng ReadingListParams. Giữ alias để các file cũ không bị lỗi. */
export type AdminReadingListParams = ReadingListParams;

export interface UpdateReadingBody {
  title?: string;
  topic?: string;
  cefr?: string;
  estimatedMinutes?: number;
  content?: string;
}