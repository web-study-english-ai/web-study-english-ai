export interface WordTopic {
  id: string;
  name: string;
}

export interface AdminWord {
  id: string;
  term: string;
  pos: string; // "VERB"
  ipa: string;
  meaningVi: string;
  exampleEn: string;
  cefr: string;
  rank: number | null;
  topic: WordTopic | null;
}

export interface WordListParams {
  page: number;
  limit: number;
  search: string;
  topicId: string; // "all" = không lọc
  cefr: string; // "all" = không lọc
}

export interface UpdateWordBody {
  term?: string;
  pos?: string;
  cefr?: string;
  ipa?: string;
  meaningVi?: string;
  exampleEn?: string;
  topicId?: string | null;
}