import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiMonitorService } from '@modules/ai-monitor/ai-monitor.service';
import { InfraResilienceService } from '@modules/infra-resilience/infra-resilience.service';

const TIMEOUT_MAC_DINH_MS = 15_000;
/** Luồng dài (streaming) cần ngưỡng chờ rộng hơn vì LLM sinh chữ tuần tự */
const TIMEOUT_LUONG_DAI_MS = 45_000;
/** Timeout riêng cho bước sinh vector câu hỏi (/assistant/embed) */
const TIMEOUT_EMBED_MAC_DINH_MS = 5_000;
/** Khoảng chờ trước khi thử lại /assistant/embed khi nhận 503 (mô hình chưa nạp xong) */
const CHO_THU_LAI_EMBED_503_MS = 2_000;
/** Sau một lần gọi hỏng, tạm ngưng gọi AI trong khoảng này */
const NGUNG_SAU_LOI_MS = 30_000;

export const SO_CHIEU_VECTOR_CHUAN = 384;
export const MODEL_EMBED_MAC_DINH = 'intfloat/multilingual-e5-small';

export interface PhanHoiTroLy {
  answer: string;
  source_ids: string[];
}

export interface KetQuaNhung {
  embedding: number[];
  model: string;
  dim: number;
  revision?: string;
}

export interface TuDangHocPayload {
  term: string;
  pos: string;
  meaning_vi: string;
}

export interface DoanNguCanhPayload {
  id: string;
  content: string;
  source: string;
  topic: string | null;
  cefr: string | null;
  distance: number;
}

export interface TuVungNguCanhPayload {
  term: string;
  pos: string;
  meaning_vi: string;
  example_en: string | null;
  match: 'exact' | 'vector';
  distance: number;
}

export interface LuotHoiThoaiPayload {
  role: 'user' | 'assistant';
  content: string;
}

export interface TuyChonNhung {
  signal?: AbortSignal;
  timeoutMs?: number;
  retryDelayMs?: number;
}

export interface TuyChonHoi {
  word?: TuDangHocPayload | null;
  userCefr?: 'A1' | 'A2' | 'B1' | 'B2' | null;
  contexts?: DoanNguCanhPayload[];
  vocab?: TuVungNguCanhPayload[];
  history?: LuotHoiThoaiPayload[];
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface TuyChonHoiTheoLuong extends TuyChonHoi {
  onDelta: (chunk: string) => void;
}

interface RawEmbedResponse {
  embedding?: unknown;
  model?: unknown;
  revision?: unknown;
  dim?: unknown;
}

interface RawAiResponse {
  answer?: unknown;
  source_ids?: unknown;
}

@Injectable()
export class AssistantClient implements OnModuleInit {
  private readonly logger = new Logger(AssistantClient.name);
  private hongLucEmbed: number | null = null;
  private hongLucAsk: number | null = null;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly aiMonitor?: AiMonitorService,
    @Optional() private readonly resilience?: InfraResilienceService,
  ) {}

  private get daCauHinh(): boolean {
    return Boolean(this.config.get('AI_SERVICE_URL') && this.config.get('AI_SERVICE_KEY'));
  }

  get embedModel(): string {
    return this.config.get<string>('AI_EMBED_MODEL') || MODEL_EMBED_MAC_DINH;
  }

  private get timeoutEmbedMs(): number {
    return Number(this.config.get('AI_EMBED_TIMEOUT_MS')) || TIMEOUT_EMBED_MAC_DINH_MS;
  }

  private get timeoutNganMs(): number {
    return Number(this.config.get('AI_ASSISTANT_TIMEOUT_MS')) || TIMEOUT_MAC_DINH_MS;
  }

  private get timeoutLuongDaiMs(): number {
    return Number(this.config.get('AI_ASSISTANT_STREAM_TIMEOUT_MS')) || TIMEOUT_LUONG_DAI_MS;
  }

  onModuleInit(): void {
    if (!this.daCauHinh) {
      this.logger.warn('Chua cau hinh AI_SERVICE_URL/AI_SERVICE_KEY, tro ly chay che do du phong');
    }
  }

  /**
   * Gộp tín hiệu ngắt từ phía người học (đóng tab/huỷ) với bộ đếm quá hạn của máy chủ.
   * Phân biệt được lỗi do người dùng tự ngắt để không đánh dấu oan là AI hỏng.
   */
  private taoTinHieu(signalNgoai: AbortSignal | undefined, timeoutMs: number): AbortSignal {
    const tinHieuTimeout = AbortSignal.timeout(timeoutMs);
    return signalNgoai ? AbortSignal.any([signalNgoai, tinHieuTimeout]) : tinHieuTimeout;
  }

  /** Đọc mảng source_ids chuẩn Hợp đồng API v0.3 */
  private docDanhSachNguon(data: RawAiResponse): string[] {
    if (Array.isArray(data.source_ids)) {
      return data.source_ids.filter((id): id is string => typeof id === 'string');
    }
    return [];
  }

  /** Đóng gói body JSON chuẩn Hợp đồng v0.3 (extra="forbid", snake_case) */
  private taoBodyHoi(question: string, opts: TuyChonHoi): Record<string, unknown> {
    const body: Record<string, unknown> = {
      question: question.trim().slice(0, 1000),
      contexts: (opts.contexts ?? []).slice(0, 20),
    };
    if (opts.word !== undefined) {
      body.word = opts.word;
    }
    if (opts.userCefr !== undefined) {
      body.user_cefr = opts.userCefr;
    }
    if (opts.vocab !== undefined) {
      body.vocab = opts.vocab.slice(0, 10);
    }
    if (opts.history !== undefined) {
      body.history = opts.history.slice(-6);
    }
    return body;
  }

  /**
   * Bước 1 (Hợp đồng v0.3): Gọi POST /assistant/embed để sinh vector 384 chiều cho câu hỏi.
   * - Kiểm tra nghiêm ngặt dim === 384 và model === AI_EMBED_MODEL trước khi cho phép truy vấn DB.
   * - Nếu nhận 503 (mô hình chưa nạp xong), chờ 2 giây rồi thử lại đúng 1 lần.
   */
  async nhungCauHoi(text: string, opts: TuyChonNhung = {}): Promise<KetQuaNhung | null> {
    if (this.aiMonitor?.isCircuitBreakerOpen()) {
      this.logger.warn(
        'Circuit Breaker đang ngắt (vượt hạn mức ngân sách), bỏ qua gọi /assistant/embed',
      );
      return null;
    }

    const vanBan = text.trim().slice(0, 1000);
    if (!vanBan) return null;
    if (opts.signal?.aborted) return null;
    if (!this.daCauHinh) return null;
    if (this.hongLucEmbed !== null && Date.now() - this.hongLucEmbed < NGUNG_SAU_LOI_MS) {
      return null;
    }

    const url = `${this.config.get<string>('AI_SERVICE_URL')}/assistant/embed`;
    const timeoutMs = opts.timeoutMs ?? this.timeoutEmbedMs;
    const retryDelayMs = opts.retryDelayMs ?? CHO_THU_LAI_EMBED_503_MS;

    for (let lan = 0; lan < 2; lan++) {
      if (opts.signal?.aborted) return null;

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'x-api-key': this.config.get<string>('AI_SERVICE_KEY') ?? '',
          },
          body: JSON.stringify({ text: vanBan }),
          signal: this.taoTinHieu(opts.signal, timeoutMs),
        });

        if (res.status === 503 && lan === 0) {
          this.logger.warn('Dich vu embed tra ve 503, cho 2s roi thu lai 1 lan');
          const daChoXong = await this.choCoTinHieu(retryDelayMs, opts.signal);
          if (!daChoXong) return null;
          continue;
        }

        if (!res.ok) {
          this.logger.warn(`Dich vu embed tra ve ${res.status}`);
          return this.danhDauHongEmbed();
        }

        const data = (await res.json()) as RawEmbedResponse;
        const modelMongDoi = this.embedModel;

        if (
          data.dim !== SO_CHIEU_VECTOR_CHUAN ||
          data.model !== modelMongDoi ||
          !Array.isArray(data.embedding) ||
          data.embedding.length !== SO_CHIEU_VECTOR_CHUAN ||
          !data.embedding.every((so): so is number => typeof so === 'number' && Number.isFinite(so))
        ) {
          this.logger.warn(
            `Ket qua embed khong khop hop dong (dim=${String(data.dim)}, model=${String(data.model)}, mong doi dim=${SO_CHIEU_VECTOR_CHUAN}, model=${modelMongDoi})`,
          );
          return this.danhDauHongEmbed();
        }

        this.khoiPhucEmbedNeuCan();
        return {
          embedding: data.embedding,
          model: data.model,
          dim: data.dim,
          revision: typeof data.revision === 'string' ? data.revision : undefined,
        };
      } catch (e) {
        if (opts.signal?.aborted) {
          this.logger.log('Nguoi hoc da ngat ket noi giua chung khi goi /assistant/embed');
          return null;
        }
        this.logger.warn(
          `Khong goi duoc /assistant/embed: ${e instanceof Error ? e.message : 'loi la'}`,
        );
        return this.danhDauHongEmbed();
      }
    }

    return this.danhDauHongEmbed();
  }

  private choCoTinHieu(ms: number, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', khiHuy);
        resolve(true);
      }, ms);
      const khiHuy = () => {
        clearTimeout(timer);
        resolve(false);
      };
      signal?.addEventListener('abort', khiHuy, { once: true });
    });
  }

  async hoi(question: string, opts: TuyChonHoi = {}): Promise<PhanHoiTroLy | null> {
    if (this.aiMonitor?.isCircuitBreakerOpen()) {
      this.logger.warn(
        'Circuit Breaker đang ngắt (vượt hạn mức ngân sách), chuyển sang phản hồi dự phòng',
      );
      return null;
    }

    if (opts.signal?.aborted) return null;
    if (!this.daCauHinh) return null;

    if (this.resilience) {
      return this.resilience.executeWithResilience(
        async () => {
          const res = await this.thucHienHoiDon(question, opts);
          if (!res) throw new Error('AI assistant response empty or failed');
          return res;
        },
        () => {
          this.danhDauHong();
          return null;
        },
        {
          serviceName: 'LLM_ASSISTANT_RAG',
          retryOptions: { signal: opts.signal },
        },
      );
    }

    return this.thucHienHoiDon(question, opts);
  }

  private async thucHienHoiDon(question: string, opts: TuyChonHoi): Promise<PhanHoiTroLy | null> {
    if (this.hongLucAsk !== null && Date.now() - this.hongLucAsk < NGUNG_SAU_LOI_MS) return null;

    const url = `${this.config.get<string>('AI_SERVICE_URL')}/assistant/ask`;
    const timeoutMs = opts.timeoutMs ?? this.timeoutNganMs;
    const start = Date.now();

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-api-key': this.config.get<string>('AI_SERVICE_KEY') ?? '',
        },
        body: JSON.stringify(this.taoBodyHoi(question, opts)),
        signal: this.taoTinHieu(opts.signal, timeoutMs),
      });

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        this.aiMonitor?.recordCall({
          serviceType: 'LLM_ASSISTANT_RAG',
          promptTokens: Math.max(Math.round(question.length / 3), 15),
          completionTokens: 0,
          latencyMs,
          success: false,
          statusCode: res.status,
        });
        this.logger.warn(`Dich vu tro ly tra ve ${res.status}`);
        return this.danhDauHong();
      }

      const data = (await res.json()) as RawAiResponse;
      if (typeof data.answer !== 'string' || data.answer.trim() === '') {
        this.aiMonitor?.recordCall({
          serviceType: 'LLM_ASSISTANT_RAG',
          promptTokens: Math.max(Math.round(question.length / 3), 15),
          completionTokens: 0,
          latencyMs,
          success: false,
          statusCode: 200,
        });
        this.logger.warn('Dich vu tro ly tra ve answer rong');
        return this.danhDauHong();
      }

      this.aiMonitor?.recordCall({
        serviceType: 'LLM_ASSISTANT_RAG',
        promptTokens: Math.max(Math.round(question.length / 3), 15),
        completionTokens: Math.max(Math.round(data.answer.length / 3), 20),
        latencyMs,
        success: true,
        statusCode: 200,
      });

      this.khoiPhucNeuCan();
      return {
        answer: data.answer,
        source_ids: this.docDanhSachNguon(data),
      };
    } catch (e) {
      const latencyMs = Date.now() - start;
      if (opts.signal?.aborted) {
        this.logger.log('Nguoi hoc da ngat ket noi giua chung, huy yeu cau goi AI');
        return null;
      }
      this.aiMonitor?.recordCall({
        serviceType: 'LLM_ASSISTANT_RAG',
        promptTokens: Math.max(Math.round(question.length / 3), 15),
        completionTokens: 0,
        latencyMs,
        success: false,
        statusCode: 500,
      });
      this.logger.warn(
        `Khong goi duoc dich vu tro ly: ${e instanceof Error ? e.message : 'loi la'}`,
      );
      return this.danhDauHong();
    }
  }

  /**
   * Gọi dịch vụ AI theo luồng (streaming) chuẩn Hợp đồng v0.3.
   * - Nếu AI trả về text/event-stream thì đọc từng đoạn từ ReadableStream và đẩy ngay qua onDelta.
   * - Chỉ coi là thành công khi nhận được khung cuối có answer (toàn văn) và [DONE].
   * - Nếu AI trả về JSON một cục thì tự tách thành các cụm từ và phát qua onDelta để frontend vẫn hiện chữ dần.
   */
  async hoiTheoLuong(question: string, opts: TuyChonHoiTheoLuong): Promise<PhanHoiTroLy | null> {
    if (this.aiMonitor?.isCircuitBreakerOpen()) {
      this.logger.warn(
        'Circuit Breaker đang ngắt (vượt hạn mức ngân sách), chuyển sang phản hồi dự phòng',
      );
      return null;
    }

    if (opts.signal?.aborted) return null;
    if (!this.daCauHinh) return null;
    if (this.hongLucAsk !== null && Date.now() - this.hongLucAsk < NGUNG_SAU_LOI_MS) return null;

    const url = `${this.config.get<string>('AI_SERVICE_URL')}/assistant/ask`;
    const timeoutMs = opts.timeoutMs ?? this.timeoutLuongDaiMs;
    const start = Date.now();

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream, application/json',
          'x-api-key': this.config.get<string>('AI_SERVICE_KEY') ?? '',
        },
        body: JSON.stringify(this.taoBodyHoi(question, opts)),
        signal: this.taoTinHieu(opts.signal, timeoutMs),
      });

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        this.aiMonitor?.recordCall({
          serviceType: 'LLM_ASSISTANT_RAG',
          promptTokens: Math.max(Math.round(question.length / 3), 15),
          completionTokens: 0,
          latencyMs,
          success: false,
          statusCode: res.status,
        });
        this.logger.warn(`Dich vu tro ly (stream) tra ve ${res.status}`);
        return this.danhDauHong();
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('text/event-stream') && res.body) {
        const streamRes = await this.docLuongSse(res.body, opts);
        this.aiMonitor?.recordCall({
          serviceType: 'LLM_ASSISTANT_RAG',
          promptTokens: Math.max(Math.round(question.length / 3), 15),
          completionTokens: streamRes ? Math.max(Math.round(streamRes.answer.length / 3), 20) : 0,
          latencyMs: Date.now() - start,
          success: Boolean(streamRes),
          statusCode: streamRes ? 200 : 500,
        });
        return streamRes;
      }

      const data = (await res.json()) as RawAiResponse;
      if (typeof data.answer !== 'string' || data.answer.trim() === '') {
        this.aiMonitor?.recordCall({
          serviceType: 'LLM_ASSISTANT_RAG',
          promptTokens: Math.max(Math.round(question.length / 3), 15),
          completionTokens: 0,
          latencyMs,
          success: false,
          statusCode: 200,
        });
        this.logger.warn('Dich vu tro ly tra ve answer rong');
        return this.danhDauHong();
      }

      this.aiMonitor?.recordCall({
        serviceType: 'LLM_ASSISTANT_RAG',
        promptTokens: Math.max(Math.round(question.length / 3), 15),
        completionTokens: Math.max(Math.round(data.answer.length / 3), 20),
        latencyMs,
        success: true,
        statusCode: 200,
      });

      this.khoiPhucNeuCan();
      this.phatTungCum(data.answer, opts);
      return {
        answer: data.answer,
        source_ids: this.docDanhSachNguon(data),
      };
    } catch (e) {
      const latencyMs = Date.now() - start;
      if (opts.signal?.aborted) {
        this.logger.log('Nguoi hoc da ngat ket noi giua chung khi dang doc luong AI');
        return null;
      }
      this.aiMonitor?.recordCall({
        serviceType: 'LLM_ASSISTANT_RAG',
        promptTokens: Math.max(Math.round(question.length / 3), 15),
        completionTokens: 0,
        latencyMs,
        success: false,
        statusCode: 500,
      });
      this.logger.warn(`Loi luong dich vu tro ly: ${e instanceof Error ? e.message : 'loi la'}`);
      return this.danhDauHong();
    }
  }

  private async docLuongSse(
    stream: ReadableStream<Uint8Array>,
    opts: TuyChonHoiTheoLuong,
  ): Promise<PhanHoiTroLy | null> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let sourceIds: string[] = [];
    let daNhanKhungAnswerCuoi = false;
    let daNhanDone = false;

    const xuLyKhung = (khung: string) => {
      for (const dong of khung.split('\n')) {
        if (!dong.startsWith('data:')) continue;
        const raw = dong.slice(5).trim();
        if (!raw) continue;
        if (raw === '[DONE]') {
          daNhanDone = true;
          continue;
        }

        try {
          const parsed = JSON.parse(raw) as RawAiResponse & { delta?: unknown };
          if (typeof parsed.delta === 'string' && parsed.delta.length > 0) {
            answer += parsed.delta;
            opts.onDelta(parsed.delta);
          }
          if (typeof parsed.answer === 'string' && parsed.answer.trim().length > 0) {
            answer = parsed.answer;
            daNhanKhungAnswerCuoi = true;
          }
          if (Array.isArray(parsed.source_ids)) {
            sourceIds = this.docDanhSachNguon(parsed);
          }
        } catch {
          // Bỏ qua khung không phải JSON hợp lệ
        }
      }
    };

    try {
      while (true) {
        if (opts.signal?.aborted) {
          await reader.cancel();
          return null;
        }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const khungList = buffer.split('\n\n');
        buffer = khungList.pop() ?? '';

        for (const khung of khungList) {
          xuLyKhung(khung);
        }
      }
      if (buffer.trim()) {
        xuLyKhung(buffer);
      }
    } finally {
      reader.releaseLock();
    }

    if (!daNhanKhungAnswerCuoi || !daNhanDone || answer.trim() === '') {
      this.logger.warn(
        `Luong SSE đứt giữa chừng hoặc thiếu khung cuối (daNhanKhungAnswerCuoi=${daNhanKhungAnswerCuoi}, daNhanDone=${daNhanDone})`,
      );
      return this.danhDauHong();
    }

    this.khoiPhucNeuCan();
    return { answer, source_ids: sourceIds };
  }

  /** Khi AI trả JSON một cục, chia theo các đoạn ~20 ký tự để phát qua SSE */
  private phatTungCum(text: string, opts: TuyChonHoiTheoLuong): void {
    const tuList = text.match(/\S+\s*/g) ?? [text];
    let cum = '';
    for (const tu of tuList) {
      if (opts.signal?.aborted) return;
      cum += tu;
      if (cum.length >= 20) {
        opts.onDelta(cum);
        cum = '';
      }
    }
    if (cum.length > 0 && !opts.signal?.aborted) {
      opts.onDelta(cum);
    }
  }

  private khoiPhucEmbedNeuCan(): void {
    if (this.hongLucEmbed !== null) {
      this.logger.log('Dich vu embed da tro lai');
      this.hongLucEmbed = null;
    }
  }

  private danhDauHongEmbed(): null {
    this.hongLucEmbed = Date.now();
    return null;
  }

  private khoiPhucNeuCan(): void {
    if (this.hongLucAsk !== null) {
      this.logger.log('Dich vu tro ly da tro lai');
      this.hongLucAsk = null;
    }
  }

  private danhDauHong(): null {
    this.hongLucAsk = Date.now();
    return null;
  }
}
