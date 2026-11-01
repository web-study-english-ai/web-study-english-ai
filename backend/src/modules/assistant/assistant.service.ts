import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { AskAssistantDto } from './dto/ask-assistant.dto';
import {
  AssistantClient,
  DoanNguCanhPayload,
  LuotHoiThoaiPayload,
  TuDangHocPayload,
  TuVungNguCanhPayload,
} from './assistant.client';

/** Khi AI không dùng được thì nói thẳng, tuyệt đối không bịa câu trả lời ngữ pháp */
const CAU_TRA_LOI_DU_PHONG =
  'Trợ lý đang tạm thời không trả lời được. Bạn thử lại sau ít phút, hoặc xem phần nghĩa và ví dụ ngay trên thẻ từ.';
/** Khi câu hỏi nằm ngoài phạm vi học tiếng Anh hoặc có dấu hiệu chèn lệnh (prompt injection) */
export const CAU_TU_CHOI_NGOAI_PHAM_VI =
  'Mình là trợ lý học tiếng Anh nên chỉ hỗ trợ giải đáp về từ vựng, ngữ pháp và cách sử dụng câu tiếng Anh. Bạn hãy đặt câu hỏi liên quan đến tiếng Anh nhé!';
/** Giới hạn lưu trữ lịch sử hội thoại: 30 ngày kể từ lần tương tác cuối */
export const HAN_LUU_HOI_THOAI_NGAY = 30;
const MOT_PHUT_MS = 60 * 1000;
const MOT_NGAY_MS = 24 * 60 * 60 * 1000;
const DO_DAI_TIEU_DE_TOI_DA = 60;
const TOP_K_MAC_DINH = 8;
const SO_NGUON_DU_PHONG_KHI_ASK_LOI = 3;
const GIOI_HAN_MOI_PHUT_MAC_DINH = 10;
const GIOI_HAN_MOI_NGAY_MAC_DINH = 50;
const TTL_CACHE_MAC_DINH_MS = 60 * 60 * 1000;
const SO_MUC_CACHE_TOI_DA = 200;

/** Mẫu phát hiện tấn công chèn câu lệnh (Prompt Injection / Jailbreak) */
const MAU_PROMPT_INJECTION =
  /(ignore\s+(all\s+)?(previous|prior|above)\s+instructions|disregard\s+(all\s+)?instructions|system\s+prompt|jailbreak|bỏ\s+qua\s+(mọi\s+|tất\s+cả\s+)?hướng\s+dẫn|quên\s+hết\s+(các\s+)?quy\s+tắc)/i;

/** Tín hiệu cho thấy câu hỏi có liên quan đến việc học tiếng Anh */
const MAU_TIN_HIEU_TIENG_ANH =
  /(tiếng\s*anh|nghĩa\s*là|dịch|ngữ\s*pháp|từ\s*vựng|từ\s*loại|thì\s+|tense|grammar|verb|noun|adj|adv|câu\s*này|phát\s*âm|cách\s*dùng|phân\s*biệt|khác\s*gì|khác\s*nhau|ví\s*dụ|synonym|antonym|idiom|phrasal|collocation|preposition|viết\s*câu|sửa\s*câu)/i;

/** Mẫu chủ đề rõ ràng ngoài phạm vi học tiếng Anh */
const MAU_CHU_DE_NGOAI_PHAM_VI =
  /(thời\s*tiết\s*hôm\s*nay|dự\s*báo\s*thời\s*tiết|công\s*thức\s*nấu|cách\s*nấu\s*món|kết\s*quả\s*bóng\s*đá|tỷ\s*số\s*trận|giá\s*(vàng|bitcoin|cổ\s*phiếu|chứng\s*khoán|xăng)|viết\s*(code|chương\s*trình)\s*(python|java|javascript|c\+\+|sql|html|php)|giải\s*(phương\s*trình|bài\s*toán)|tính\s*(tích\s*phân|đạo\s*hàm)|tư\s*vấn\s*(tình\s*cảm|y\s*tế|thuốc\s*chữa))/i;

interface MucCacheTroLy {
  answer: string;
  sources: NguonDan[];
  hetHanLuc: number;
}
export interface NguonDan {
  id: string;
  source: string;
  topic: string | null;
}

export interface KetQuaHoiTroLy {
  answer: string;
  sources: NguonDan[];
  degraded: boolean;
  conversationId?: string | null;
  aborted?: boolean;
}

export type SuKienLuongTroLy =
  | { event: 'delta'; data: { text: string } }
  | {
      event: 'done';
      data: KetQuaHoiTroLy;
    };

interface DongKbChunkRaw {
  id: string;
  content: string;
  source: string;
  topic: string | null;
  cefr: string | null;
  distance: number;
}

interface DongWordVectorRaw {
  term: string;
  pos: string;
  meaning_vi: string;
  example_en: string | null;
  distance: number;
}

interface KetQuaTruyHoi {
  thanhCong: boolean;
  word: TuDangHocPayload | null;
  userCefr: 'A1' | 'A2' | 'B1' | 'B2' | null;
  contexts: DoanNguCanhPayload[];
  vocab: TuVungNguCanhPayload[];
  history: LuotHoiThoaiPayload[];
}

@Injectable()
export class AssistantService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AssistantService.name);
  private boHenGioDonDep: NodeJS.Timeout | null = null;
  private readonly boNhoDemCauHoi = new Map<string, MucCacheTroLy>();
  private readonly luotGoiTheoPhut = new Map<string, number[]>();
  private readonly luotGoiTheoNgay = new Map<string, { ngay: string; soLuot: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClient: AssistantClient,
    @Optional() private readonly config?: ConfigService,
  ) {}

  private get topK(): number {
    const cauHinh = Number(this.config?.get('AI_ASSISTANT_TOP_K')) || TOP_K_MAC_DINH;
    return Math.min(20, Math.max(1, Math.trunc(cauHinh)));
  }

  private get gioiHanMoiPhut(): number {
    const cauHinh =
      Number(this.config?.get('AI_ASSISTANT_RATE_LIMIT_PER_MIN')) || GIOI_HAN_MOI_PHUT_MAC_DINH;
    return Math.max(1, Math.trunc(cauHinh));
  }

  private get gioiHanMoiNgay(): number {
    const cauHinh =
      Number(this.config?.get('AI_ASSISTANT_RATE_LIMIT_PER_DAY')) || GIOI_HAN_MOI_NGAY_MAC_DINH;
    return Math.max(1, Math.trunc(cauHinh));
  }

  private get cacheTtlMs(): number {
    const cauHinh = Number(this.config?.get('AI_ASSISTANT_CACHE_TTL_MS')) || TTL_CACHE_MAC_DINH_MS;
    return Math.max(1_000, Math.trunc(cauHinh));
  }

  onModuleInit(): void {
    void this.donDepHoiThoaiQuaHan().catch(() => null);
    this.boHenGioDonDep = setInterval(() => {
      void this.donDepHoiThoaiQuaHan().catch(() => null);
    }, MOT_NGAY_MS);
    this.boHenGioDonDep.unref?.();
  }

  onModuleDestroy(): void {
    if (this.boHenGioDonDep) {
      clearInterval(this.boHenGioDonDep);
      this.boHenGioDonDep = null;
    }
  }

  async ask(userId: string, dto: AskAssistantDto, signal?: AbortSignal): Promise<KetQuaHoiTroLy> {
    // Bấm gửi hai lần, hoặc client gửi lại sau khi mất mạng: cùng clientEventId
    // thì trả lại đúng câu trả lời cũ, không gọi AI và không ghi log lần hai.
    if (dto.clientEventId) {
      const daTraLoi = await this.prisma.assistantQuery.findUnique({
        where: { clientEventId: dto.clientEventId },
      });
      if (daTraLoi) {
        return {
          answer: daTraLoi.answer ?? CAU_TRA_LOI_DU_PHONG,
          sources: await this.layNguon(daTraLoi.sourceIds),
          conversationId: daTraLoi.conversationId ?? null,
          degraded: daTraLoi.degraded,
        };
      }
    }

    // 1. Giới hạn tần suất gọi theo người dùng (Rate Limit)
    this.kiemTraVaGhiNhanTanSuat(userId);

    const cauHoiGoc = dto.question.trim().slice(0, 1000);

    // 2. Chặn sớm câu hỏi ngoài phạm vi hoặc có dấu hiệu Prompt Injection (Guardrail)
    if (this.laCauHoiNgoaiPhamVi(cauHoiGoc, dto.wordId)) {
      const conversationId = await this.damBaoHoiThoai(userId, dto.question, dto.conversationId);
      await this.prisma.assistantQuery.create({
        data: {
          userId,
          conversationId,
          question: dto.question,
          answer: CAU_TU_CHOI_NGOAI_PHAM_VI,
          wordId: dto.wordId ?? null,
          sourceIds: [],
          degraded: false,
          durationMs: 0,
          clientEventId: dto.clientEventId ?? null,
        },
      });
      return {
        answer: CAU_TU_CHOI_NGOAI_PHAM_VI,
        sources: [],
        degraded: false,
        conversationId,
      };
    }

    // 3. Kiểm tra bộ nhớ đệm (Cache) cho câu hỏi độc lập thường gặp
    if (!dto.conversationId) {
      const tuCache = this.docTuCache(cauHoiGoc, dto.wordId);
      if (tuCache) {
        const conversationId = await this.damBaoHoiThoai(userId, dto.question);
        await this.prisma.assistantQuery.create({
          data: {
            userId,
            conversationId,
            question: dto.question,
            answer: tuCache.answer,
            wordId: dto.wordId ?? null,
            sourceIds: tuCache.sources.map((s) => s.id),
            degraded: false,
            durationMs: 0,
            clientEventId: dto.clientEventId ?? null,
          },
        });
        return {
          answer: tuCache.answer,
          sources: tuCache.sources,
          degraded: false,
          conversationId,
        };
      }
    }

    const batDau = Date.now();
    const truyHoi = await this.truyHoiNguCanh(
      userId,
      cauHoiGoc,
      dto.wordId,
      dto.conversationId,
      signal,
    );

    if (signal?.aborted) {
      return {
        answer: '',
        sources: [],
        degraded: false,
        aborted: true,
      };
    }

    const phanHoi = truyHoi.thanhCong
      ? await this.aiClient.hoi(cauHoiGoc, {
          word: truyHoi.word,
          userCefr: truyHoi.userCefr,
          contexts: truyHoi.contexts,
          vocab: truyHoi.vocab,
          history: truyHoi.history,
          signal,
        })
      : null;
    const durationMs = Date.now() - batDau;

    // Nếu người học chủ động ngắt kết nối giữa chừng thì dừng luôn, không ghi nhận là AI lỗi
    if (signal?.aborted) {
      return {
        answer: '',
        sources: [],
        degraded: false,
        aborted: true,
      };
    }

    const conversationId = await this.damBaoHoiThoai(userId, dto.question, dto.conversationId);
    const { sourceIdsLuu, sourcesTraVe } = await this.chonNguonKetQua(
      phanHoi?.source_ids,
      truyHoi.contexts,
      phanHoi !== null,
    );

    if (phanHoi !== null && !dto.conversationId) {
      this.luuVaoCache(cauHoiGoc, dto.wordId, phanHoi.answer, sourcesTraVe);
    }

    // Ghi cả lượt hỏng: không có answer thì vẫn biết người học đang vướng chỗ nào
    await this.prisma.assistantQuery.create({
      data: {
        userId,
        conversationId,
        question: dto.question,
        answer: phanHoi?.answer ?? null,
        wordId: dto.wordId ?? null,
        sourceIds: sourceIdsLuu,
        degraded: phanHoi === null,
        durationMs,
        clientEventId: dto.clientEventId ?? null,
      },
    });

    return {
      answer: phanHoi?.answer ?? CAU_TRA_LOI_DU_PHONG,
      sources: sourcesTraVe,
      degraded: phanHoi === null,
      conversationId,
    };
  }

  /**
   * Xử lý hỏi đáp theo luồng (SSE):
   * - Gọi emit({ event: 'delta', data: { text } }) cho từng mảnh văn bản.
   * - Cuối luồng gọi emit({ event: 'done', data: { answer, sources, degraded } }).
   */
  async askStream(
    userId: string,
    dto: AskAssistantDto,
    emit: (suKien: SuKienLuongTroLy) => void,
    signal?: AbortSignal,
  ): Promise<KetQuaHoiTroLy> {
    if (dto.clientEventId) {
      const daTraLoi = await this.prisma.assistantQuery.findUnique({
        where: { clientEventId: dto.clientEventId },
      });
      if (daTraLoi) {
        const answer = daTraLoi.answer ?? CAU_TRA_LOI_DU_PHONG;
        const sources = await this.layNguon(daTraLoi.sourceIds);
        emit({ event: 'delta', data: { text: answer } });
        const ketQua: KetQuaHoiTroLy = {
          answer,
          sources,
          degraded: daTraLoi.degraded,
          conversationId: daTraLoi.conversationId ?? null,
        };
        emit({ event: 'done', data: ketQua });
        return ketQua;
      }
    }

    // 1. Giới hạn tần suất gọi theo người dùng (Rate Limit)
    this.kiemTraVaGhiNhanTanSuat(userId);

    const cauHoiGoc = dto.question.trim().slice(0, 1000);

    // 2. Chặn sớm câu hỏi ngoài phạm vi hoặc có dấu hiệu Prompt Injection (Guardrail)
    if (this.laCauHoiNgoaiPhamVi(cauHoiGoc, dto.wordId)) {
      const conversationId = await this.damBaoHoiThoai(userId, dto.question, dto.conversationId);
      await this.prisma.assistantQuery.create({
        data: {
          userId,
          conversationId,
          question: dto.question,
          answer: CAU_TU_CHOI_NGOAI_PHAM_VI,
          wordId: dto.wordId ?? null,
          sourceIds: [],
          degraded: false,
          durationMs: 0,
          clientEventId: dto.clientEventId ?? null,
        },
      });
      emit({ event: 'delta', data: { text: CAU_TU_CHOI_NGOAI_PHAM_VI } });
      const ketQua: KetQuaHoiTroLy = {
        answer: CAU_TU_CHOI_NGOAI_PHAM_VI,
        sources: [],
        degraded: false,
        conversationId,
      };
      emit({ event: 'done', data: ketQua });
      return ketQua;
    }

    // 3. Kiểm tra bộ nhớ đệm (Cache) cho câu hỏi độc lập thường gặp
    if (!dto.conversationId) {
      const tuCache = this.docTuCache(cauHoiGoc, dto.wordId);
      if (tuCache) {
        const conversationId = await this.damBaoHoiThoai(userId, dto.question);
        await this.prisma.assistantQuery.create({
          data: {
            userId,
            conversationId,
            question: dto.question,
            answer: tuCache.answer,
            wordId: dto.wordId ?? null,
            sourceIds: tuCache.sources.map((s) => s.id),
            degraded: false,
            durationMs: 0,
            clientEventId: dto.clientEventId ?? null,
          },
        });
        emit({ event: 'delta', data: { text: tuCache.answer } });
        const ketQua: KetQuaHoiTroLy = {
          answer: tuCache.answer,
          sources: tuCache.sources,
          degraded: false,
          conversationId,
        };
        emit({ event: 'done', data: ketQua });
        return ketQua;
      }
    }

    const batDau = Date.now();
    const truyHoi = await this.truyHoiNguCanh(
      userId,
      cauHoiGoc,
      dto.wordId,
      dto.conversationId,
      signal,
    );

    if (signal?.aborted) {
      return {
        answer: '',
        sources: [],
        degraded: false,
        aborted: true,
      };
    }

    let daPhatDelta = false;
    const phanHoi = truyHoi.thanhCong
      ? await this.aiClient.hoiTheoLuong(cauHoiGoc, {
          word: truyHoi.word,
          userCefr: truyHoi.userCefr,
          contexts: truyHoi.contexts,
          vocab: truyHoi.vocab,
          history: truyHoi.history,
          signal,
          onDelta: (chunk) => {
            if (signal?.aborted) return;
            daPhatDelta = true;
            emit({ event: 'delta', data: { text: chunk } });
          },
        })
      : null;
    const durationMs = Date.now() - batDau;

    if (signal?.aborted) {
      return {
        answer: '',
        sources: [],
        degraded: false,
        aborted: true,
      };
    }

    const conversationId = await this.damBaoHoiThoai(userId, dto.question, dto.conversationId);
    const { sourceIdsLuu, sourcesTraVe } = await this.chonNguonKetQua(
      phanHoi?.source_ids,
      truyHoi.contexts,
      phanHoi !== null,
    );

    if (phanHoi !== null && !dto.conversationId) {
      this.luuVaoCache(cauHoiGoc, dto.wordId, phanHoi.answer, sourcesTraVe);
    }

    await this.prisma.assistantQuery.create({
      data: {
        userId,
        conversationId,
        question: dto.question,
        answer: phanHoi?.answer ?? null,
        wordId: dto.wordId ?? null,
        sourceIds: sourceIdsLuu,
        degraded: phanHoi === null,
        durationMs,
        clientEventId: dto.clientEventId ?? null,
      },
    });

    const answer = phanHoi?.answer ?? CAU_TRA_LOI_DU_PHONG;
    if (!daPhatDelta) {
      emit({ event: 'delta', data: { text: answer } });
    }

    const ketQua: KetQuaHoiTroLy = {
      answer,
      sources: sourcesTraVe,
      degraded: phanHoi === null,
      conversationId,
    };
    emit({ event: 'done', data: ketQua });
    return ketQua;
  }

  /**
   * Bước 1 & 2 (Hợp đồng v0.3):
   * 1. Lấy thông tin từ đang học (nếu có wordId), trình độ CEFR của học viên và lịch sử hội thoại (<= 6 lượt).
   * 2. Gọi /assistant/embed lấy vector 384 chiều (nối "(<term>)" vào cuối câu hỏi nếu có wordId).
   * 3. Chạy truy vấn SQL pgvector trên kb_chunks (top-K) và word_embeddings (top-3) kèm tra chính xác từ tiếng Anh.
   */
  private async truyHoiNguCanh(
    userId: string,
    cauHoiGoc: string,
    wordId?: string,
    conversationId?: string,
    signal?: AbortSignal,
  ): Promise<KetQuaTruyHoi> {
    const ketQuaRong: KetQuaTruyHoi = {
      thanhCong: false,
      word: null,
      userCefr: null,
      contexts: [],
      vocab: [],
      history: [],
    };

    const [tuDangHoc, nguoiDung, lichSu] = await Promise.all([
      wordId
        ? this.prisma.word?.findUnique?.({
            where: { id: wordId },
            select: { term: true, pos: true, meaningVi: true, exampleEn: true },
          })
        : Promise.resolve(null),
      this.prisma.user?.findUnique?.({
        where: { id: userId },
        select: { level: true },
      }),
      this.layLichSuGanNhat(userId, conversationId),
    ]);

    const wordPayload: TuDangHocPayload | null = tuDangHoc
      ? {
          term: tuDangHoc.term.slice(0, 100),
          pos: String(tuDangHoc.pos),
          meaning_vi: tuDangHoc.meaningVi,
        }
      : null;
    const userCefr = nguoiDung?.level ?? null;

    const textGuiEmbed = tuDangHoc ? `${cauHoiGoc} (${tuDangHoc.term})`.slice(0, 1000) : cauHoiGoc;

    const kqNhung = await this.aiClient.nhungCauHoi(textGuiEmbed, { signal });
    if (!kqNhung || signal?.aborted) {
      return {
        ...ketQuaRong,
        word: wordPayload,
        userCefr,
        history: lichSu,
      };
    }

    try {
      const chuoiVector = `[${kqNhung.embedding.join(',')}]`;
      const modelEmbed = kqNhung.model;
      const topK = this.topK;

      const [dongChunkRaw, tuChinhXac, dongTuVectorRaw] = await Promise.all([
        typeof this.prisma.$queryRaw === 'function'
          ? this.prisma.$queryRaw<DongKbChunkRaw[]>`
              SELECT id, content, source, topic, cefr::text AS cefr,
                     (embedding <=> ${chuoiVector}::vector) AS distance
              FROM kb_chunks
              WHERE embedding IS NOT NULL
                AND embedding_model = ${modelEmbed}
              ORDER BY embedding <=> ${chuoiVector}::vector
              LIMIT ${topK}
            `
          : Promise.resolve([] as DongKbChunkRaw[]),
        this.traTuChinhXac(cauHoiGoc, tuDangHoc?.term),
        typeof this.prisma.$queryRaw === 'function'
          ? this.prisma.$queryRaw<DongWordVectorRaw[]>`
              SELECT w.term, w.pos::text AS pos, w.meaning_vi, w.example_en, t.distance
              FROM (
                SELECT word_id, (embedding <=> ${chuoiVector}::vector) AS distance
                FROM word_embeddings
                WHERE model = ${modelEmbed}
                ORDER BY embedding <=> ${chuoiVector}::vector
                LIMIT 3
              ) t
              JOIN words w ON w.id = t.word_id
              ORDER BY t.distance
            `
          : Promise.resolve([] as DongWordVectorRaw[]),
      ]);

      const daThayChunk = new Set<string>();
      const contexts: DoanNguCanhPayload[] = [];
      for (const dong of dongChunkRaw ?? []) {
        if (!dong?.id || daThayChunk.has(dong.id)) continue;
        daThayChunk.add(dong.id);
        const khoangCach = Number(dong.distance);
        contexts.push({
          id: dong.id,
          content: String(dong.content ?? '').slice(0, 4000),
          source: String(dong.source ?? ''),
          topic: dong.topic ?? null,
          cefr: dong.cefr ?? null,
          distance: Number.isFinite(khoangCach) ? Math.min(2, Math.max(0, khoangCach)) : 0,
        });
        if (contexts.length >= 20) break;
      }

      const daThayTu = new Set<string>();
      const vocab: TuVungNguCanhPayload[] = [];
      for (const tu of tuChinhXac) {
        const khoa = tu.term.toLowerCase();
        if (daThayTu.has(khoa)) continue;
        daThayTu.add(khoa);
        vocab.push(tu);
      }
      for (const dong of dongTuVectorRaw ?? []) {
        if (!dong?.term) continue;
        const khoa = dong.term.toLowerCase();
        if (daThayTu.has(khoa)) continue;
        daThayTu.add(khoa);
        const khoangCach = Number(dong.distance);
        vocab.push({
          term: dong.term,
          pos: String(dong.pos),
          meaning_vi: dong.meaning_vi,
          example_en: dong.example_en ?? null,
          match: 'vector',
          distance: Number.isFinite(khoangCach) ? Math.min(2, Math.max(0, khoangCach)) : 0,
        });
        if (vocab.length >= 10) break;
      }

      return {
        thanhCong: true,
        word: wordPayload,
        userCefr,
        contexts,
        vocab: vocab.slice(0, 10),
        history: lichSu,
      };
    } catch (e) {
      this.logger.warn(
        `Loi truy van pgvector trong truyHoiNguCanh: ${e instanceof Error ? e.message : 'loi la'}`,
      );
      return {
        ...ketQuaRong,
        word: wordPayload,
        userCefr,
        history: lichSu,
      };
    }
  }

  /**
   * Tra chính xác các từ tiếng Anh xuất hiện trong câu hỏi trên bảng words (match = "exact", distance = 0)
   */
  private async traTuChinhXac(
    cauHoi: string,
    tuDangHocTerm?: string,
  ): Promise<TuVungNguCanhPayload[]> {
    if (!this.prisma.word?.findMany) return [];

    const cacTu = cauHoi.toLowerCase().match(/\b[a-z]{2,30}\b/g) ?? [];
    const danhSachTerm = Array.from(
      new Set(tuDangHocTerm ? [tuDangHocTerm.toLowerCase(), ...cacTu] : cacTu),
    ).slice(0, 15);

    if (danhSachTerm.length === 0) return [];

    const ketQua = await this.prisma.word.findMany({
      where: { term: { in: danhSachTerm } },
      take: 5,
      select: {
        term: true,
        pos: true,
        meaningVi: true,
        exampleEn: true,
      },
    });

    return (ketQua ?? []).map((w) => ({
      term: w.term,
      pos: String(w.pos),
      meaning_vi: w.meaningVi,
      example_en: w.exampleEn ?? null,
      match: 'exact' as const,
      distance: 0,
    }));
  }

  /**
   * Lấy tối đa 6 lượt hội thoại gần nhất (3 cặp user/assistant) trong cuộc hội thoại hiện tại
   */
  private async layLichSuGanNhat(
    userId: string,
    conversationId?: string,
  ): Promise<LuotHoiThoaiPayload[]> {
    if (!conversationId || !this.prisma.assistantQuery?.findMany) return [];

    const cacLuot = await this.prisma.assistantQuery.findMany({
      where: {
        userId,
        conversationId,
        degraded: false,
        answer: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        question: true,
        answer: true,
      },
    });

    const lichSu: LuotHoiThoaiPayload[] = [];
    for (const luot of (cacLuot ?? []).reverse()) {
      if (luot.question) {
        lichSu.push({ role: 'user', content: luot.question.slice(0, 2000) });
      }
      if (luot.answer) {
        lichSu.push({ role: 'assistant', content: luot.answer.slice(0, 2000) });
      }
    }
    return lichSu.slice(-6);
  }

  /**
   * Lọc source_ids thuộc tập contexts đã gửi (source_ids ⊂ contexts[].id).
   * Nếu /ask bị lỗi nhưng bước truy hồi pgvector đã lấy được contexts, trả kèm 3 nguồn đầu tiên.
   */
  private async chonNguonKetQua(
    sourceIdsTuAi: string[] | undefined,
    contextsDaGui: DoanNguCanhPayload[],
    askThanhCong: boolean,
  ): Promise<{ sourceIdsLuu: string[]; sourcesTraVe: NguonDan[] }> {
    const banDoContext = new Map<string, NguonDan>(
      contextsDaGui.map((c) => [c.id, { id: c.id, source: c.source, topic: c.topic }]),
    );

    if (askThanhCong) {
      const danhSachId = sourceIdsTuAi ?? [];
      const idHopLe = Array.from(
        new Set(danhSachId.filter((id) => banDoContext.size === 0 || banDoContext.has(id))),
      );
      if (idHopLe.length === 0) {
        return { sourceIdsLuu: [], sourcesTraVe: [] };
      }

      const tuDb = await this.layNguon(idHopLe);
      const banDoDb = new Map(tuDb.map((n) => [n.id, n]));
      const sourcesTraVe = idHopLe
        .map((id) => banDoDb.get(id) ?? banDoContext.get(id))
        .filter((n): n is NguonDan => Boolean(n));

      return { sourceIdsLuu: idHopLe, sourcesTraVe };
    }

    // Khi /ask lỗi hoặc timeout: trả kèm tối đa 3 nguồn đầu đã truy hồi được để người học tự đọc
    const baNguonDau = contextsDaGui.slice(0, SO_NGUON_DU_PHONG_KHI_ASK_LOI);
    return {
      sourceIdsLuu: baNguonDau.map((c) => c.id),
      sourcesTraVe: baNguonDau.map((c) => ({
        id: c.id,
        source: c.source,
        topic: c.topic,
      })),
    };
  }

  /** Lấy metadata đoạn tri thức, select tường minh để không kéo 384 số embedding về client */
  private async layNguon(ids: string[]): Promise<NguonDan[]> {
    if (ids.length === 0) return [];
    return this.prisma.kbChunk.findMany({
      where: { id: { in: ids } },
      select: { id: true, source: true, topic: true },
    });
  }

  /** Danh sách cuộc hội thoại của người học (chỉ trả các cuộc hội thoại còn trong hạn 30 ngày) */
  async listConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: {
        userId,
        updatedAt: { gte: this.mocHetHan() },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { messages: true },
        },
      },
    });
  }

  /** Chi tiết cuộc hội thoại kèm toàn bộ lượt hỏi đáp theo thứ tự thời gian */
  async getConversation(userId: string, conversationId: string) {
    const hoiThoai = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        userId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            question: true,
            answer: true,
            wordId: true,
            sourceIds: true,
            degraded: true,
            createdAt: true,
          },
        },
      },
    });

    if (!hoiThoai || hoiThoai.userId !== userId || hoiThoai.updatedAt < this.mocHetHan()) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại');
    }

    const tatCaSourceId = Array.from(new Set(hoiThoai.messages.flatMap((m) => m.sourceIds)));
    const danhSachNguon = await this.layNguon(tatCaSourceId);
    const banDoNguon = new Map(danhSachNguon.map((n) => [n.id, n]));

    return {
      id: hoiThoai.id,
      title: hoiThoai.title,
      createdAt: hoiThoai.createdAt,
      updatedAt: hoiThoai.updatedAt,
      messages: hoiThoai.messages.map((m) => ({
        id: m.id,
        question: m.question,
        answer: m.answer ?? CAU_TRA_LOI_DU_PHONG,
        wordId: m.wordId,
        degraded: m.degraded,
        createdAt: m.createdAt,
        sources: m.sourceIds
          .map((id) => banDoNguon.get(id))
          .filter((n): n is NguonDan => Boolean(n)),
      })),
    };
  }

  /** Xóa cuộc hội thoại thuộc quyền sở hữu của người học */
  async deleteConversation(userId: string, conversationId: string): Promise<{ deleted: true }> {
    const hoiThoai = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userId: true },
    });

    if (!hoiThoai || hoiThoai.userId !== userId) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại');
    }

    await this.prisma.conversation.delete({
      where: { id: hoiThoai.id },
    });

    return { deleted: true };
  }

  /** Xóa toàn bộ cuộc hội thoại không có tương tác mới trong 30 ngày qua */
  async donDepHoiThoaiQuaHan(): Promise<number> {
    if (!this.prisma.conversation?.deleteMany) return 0;
    const ketQua = await this.prisma.conversation.deleteMany({
      where: {
        updatedAt: { lt: this.mocHetHan() },
      },
    });
    return ketQua.count;
  }

  /**
   * Đảm bảo có một cuộc hội thoại hợp lệ cho lượt hỏi đáp:
   * - Nếu truyền conversationId: kiểm tra đúng chủ sở hữu và chưa quá hạn 30 ngày, sau đó chạm updatedAt.
   * - Nếu không truyền: tạo cuộc hội thoại mới lấy tiêu đề từ câu hỏi đầu tiên.
   */
  private async damBaoHoiThoai(
    userId: string,
    question: string,
    conversationId?: string,
  ): Promise<string | null> {
    if (conversationId) {
      const hienCo = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true, userId: true, updatedAt: true },
      });

      if (!hienCo || hienCo.userId !== userId || hienCo.updatedAt < this.mocHetHan()) {
        throw new NotFoundException('Không tìm thấy cuộc hội thoại');
      }

      await this.prisma.conversation.update({
        where: { id: hienCo.id },
        data: { updatedAt: new Date() },
      });

      return hienCo.id;
    }
    if (!this.prisma.conversation?.create) return null;

    const moi = await this.prisma.conversation.create({
      data: {
        userId,
        title: this.taoTieuDe(question),
      },
      select: { id: true },
    });

    return moi.id;
  }

  private taoTieuDe(question: string): string {
    const gon = question.replace(/\s+/g, ' ').trim();
    if (gon.length <= DO_DAI_TIEU_DE_TOI_DA) return gon;
    return `${gon.slice(0, DO_DAI_TIEU_DE_TOI_DA - 1).trimEnd()}…`;
  }

  private mocHetHan(): Date {
    return new Date(Date.now() - HAN_LUU_HOI_THOAI_NGAY * MOT_NGAY_MS);
  }
  /**
   * Kiểm tra câu hỏi có thuộc diện Prompt Injection hoặc nằm ngoài phạm vi học tiếng Anh hay không.
   */
  private laCauHoiNgoaiPhamVi(cauHoi: string, wordId?: string): boolean {
    const chuanHoa = cauHoi.replace(/\s+/g, ' ').trim();
    if (MAU_PROMPT_INJECTION.test(chuanHoa)) {
      return true;
    }
    if (wordId || MAU_TIN_HIEU_TIENG_ANH.test(chuanHoa)) {
      return false;
    }
    return MAU_CHU_DE_NGOAI_PHAM_VI.test(chuanHoa);
  }

  /**
   * Giới hạn tần suất gọi trợ lý theo người dùng (theo phút và theo ngày).
   * Ném lỗi 429 Too Many Requests khi vượt ngưỡng.
   */
  private kiemTraVaGhiNhanTanSuat(userId: string): void {
    const bayGio = Date.now();
    const dauCuaSoPhut = bayGio - MOT_PHUT_MS;
    const lichSuPhut = (this.luotGoiTheoPhut.get(userId) ?? []).filter((t) => t > dauCuaSoPhut);

    if (lichSuPhut.length >= this.gioiHanMoiPhut) {
      throw new HttpException(
        'Bạn đã gửi quá nhiều câu hỏi trong thời gian ngắn. Vui lòng đợi ít phút rồi thử lại.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const homNay = new Date(bayGio).toISOString().slice(0, 10);
    const thongKeNgay = this.luotGoiTheoNgay.get(userId);
    const soLuotHomNay = thongKeNgay && thongKeNgay.ngay === homNay ? thongKeNgay.soLuot : 0;

    if (soLuotHomNay >= this.gioiHanMoiNgay) {
      throw new HttpException(
        'Bạn đã dùng hết hạn mức hỏi trợ lý trong ngày hôm nay. Vui lòng quay lại vào ngày mai nhé.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    lichSuPhut.push(bayGio);
    this.luotGoiTheoPhut.set(userId, lichSuPhut);
    this.luotGoiTheoNgay.set(userId, { ngay: homNay, soLuot: soLuotHomNay + 1 });
  }

  private taoKhoaCache(cauHoi: string, wordId?: string): string {
    const cauHoiChuan = cauHoi.replace(/\s+/g, ' ').trim().toLowerCase();
    return `${(wordId ?? '').toLowerCase()}::${cauHoiChuan}`;
  }

  private docTuCache(cauHoi: string, wordId?: string): MucCacheTroLy | null {
    const khoa = this.taoKhoaCache(cauHoi, wordId);
    const muc = this.boNhoDemCauHoi.get(khoa);
    if (!muc) return null;

    if (Date.now() > muc.hetHanLuc) {
      this.boNhoDemCauHoi.delete(khoa);
      return null;
    }

    // Làm mới thứ tự LRU
    this.boNhoDemCauHoi.delete(khoa);
    this.boNhoDemCauHoi.set(khoa, muc);
    return muc;
  }

  private luuVaoCache(
    cauHoi: string,
    wordId: string | undefined,
    answer: string,
    sources: NguonDan[],
  ): void {
    if (!answer.trim()) return;
    const khoa = this.taoKhoaCache(cauHoi, wordId);
    if (this.boNhoDemCauHoi.has(khoa)) {
      this.boNhoDemCauHoi.delete(khoa);
    } else if (this.boNhoDemCauHoi.size >= SO_MUC_CACHE_TOI_DA) {
      const [khoaCuNhat] = this.boNhoDemCauHoi.keys();
      if (khoaCuNhat !== undefined) {
        this.boNhoDemCauHoi.delete(khoaCuNhat);
      }
    }

    this.boNhoDemCauHoi.set(khoa, {
      answer,
      sources,
      hetHanLuc: Date.now() + this.cacheTtlMs,
    });
  }
}
