import { CefrLevel, PartOfSpeech } from '@prisma/client';

/** Tệp ảnh nhận từ multipart/form-data */
export interface TepAnhTaiLen {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

/** Một nhãn từ vựng do dịch vụ AI trả về (hợp đồng v0.4) */
export interface NhanAiTraVe {
  word: string;
  score: number;
}

/** Phản hồi đã chuẩn hoá từ POST /recognize/image của dịch vụ AI */
export interface PhanHoiNhanDienAi {
  items: NhanAiTraVe[];
  lowConfidence: boolean;
  tau: number | null;
  latencyMs: number;
}

/** Một từ vựng đã nối với bảng words để trả về cho Frontend */
export interface TuVungNhanDien {
  wordId: string;
  term: string;
  ipa: string | null;
  pos: PartOfSpeech;
  meaningVi: string;
  exampleEn: string | null;
  cefr: CefrLevel;
  topic: {
    id: string;
    slug: string;
    name: string;
  } | null;
  score: number;
  inDeck: boolean;
}

/** Kết quả trả về của API nhận diện ảnh phía Backend */
export interface KetQuaNhanDienAnh {
  items: TuVungNhanDien[];
  results: TuVungNhanDien[];
  imageHash: string;
  imageUrl: string | null;
  lowConfidence: boolean;
  tau: number | null;
  degraded: boolean;
  cached: boolean;
  latencyMs: number;
  message?: string;
}
