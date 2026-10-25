export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1";
export type ReadingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface ReadingProgress {
  status: ReadingStatus;
  answeredCount: number;
  correctCount: number;
  totalQuestions: number;
}

export interface ReadingItem {
  id: string;
  title: string;
  description: string;
  cefr: string;
  topic: string;
  estimatedMinutes: number | null;
  progress: ReadingProgress;
}

export interface ReadingTopic {
  value: string;
  label: string;
}

export interface ReadingListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ReadingListResult {
  items: ReadingItem[];
  topics: ReadingTopic[];
  meta: ReadingListMeta;
}

export interface ReadingFilterState {
  searchInput: string;
  cefr: CefrLevel | "all";
  topic: string;
  status: ReadingStatus | "all";
  sort: string;
}

export interface ReadingListParams {
  search: string;
  cefr: CefrLevel | "all";
  topic: string;
  status: ReadingStatus | "all";
  sort: string;
  page: number;
  limit: number;
}

export interface ReadingQuestion {
  id: string;
  orderIndex: number;
  questionText: string;
  options: string[];
}

export interface AnswerInput {
  questionId: string;
  selectedOptionIndex: number;
}

export interface AttemptPayload {
  durationSeconds: number;
  answers: AnswerInput[];
}

export interface ReadingDraft {
  durationSeconds: number;
  answers: AnswerInput[];
}

export interface ReadingDetailData {
  id: string;
  title: string;
  cefr: string;
  topic: string;
  content: string;
  questions: ReadingQuestion[];
  draft: ReadingDraft | null;
}

export interface QuestionResult {
  questionId: string;
  correctOptionIndex: number;
  explanation: string;
}

export interface SubmitResult {
  correctCount: number;
  wrongCount: number;
  totalQuestions: number;
  results: QuestionResult[];
}