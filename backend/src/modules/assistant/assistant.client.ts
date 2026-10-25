import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiMonitorService } from '@modules/ai-monitor/ai-monitor.service';

const TIMEOUT_MAC_DINH_MS = 15_000;
/** Luồng dài (streaming) cần ngưỡng chờ rộng hơn vì LLM sinh chữ tuần tự */
const TIMEOUT_LUONG_DAI_MS = 45_000;
/** Sau một lần gọi hỏng, tạm ngưng gọi AI trong khoảng này */
const NGUNG_SAU_LOI_MS = 30_000;

export interface PhanHoiTroLy {
  answer: string;
  source_ids: string[];
}

export interface TuyChonHoi {
  wordId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface TuyChonHoiTheoLuong extends TuyChonHoi {
  onDelta: (chunk: string) => void;
}

interface RawAiResponse {
  answer?: unknown;
  source_ids?: unknown;
  sources?: Array<{ source_id?: unknown } | string>;
}

@Injectable()
export class AssistantClient implements OnModuleInit {
  private readonly logger = new Logger(AssistantClient.name);
  private hongLuc: number | null = null;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly aiMonitor?: AiMonitorService,
  ) {}

  private get daCauHinh(): boolean {
    return Boolean(this.config.get('AI_SERVICE_URL') && this.config.get('AI_SERVICE_KEY'));
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

  /** Hỗ trợ cả hai định dạng trả nguồn: source_ids: string[] và sources: [{ source_id }] */
  private docDanhSachNguon(data: RawAiResponse): string[] {
    if (Array.isArray(data.source_ids)) {
      return data.source_ids.filter((id): id is string => typeof id === 'string');
    }
    if (Array.isArray(data.sources)) {
      return data.sources
        .map((item) => (typeof item === 'string' ? item : item?.source_id))
        .filter((id): id is string => typeof id === 'string');
    }
    return [];
  }

  async hoi(question: string, wordIdOrOpts?: string | TuyChonHoi): Promise<PhanHoiTroLy | null> {
    if (this.aiMonitor?.isCircuitBreakerOpen()) {
      this.logger.warn('Circuit Breaker đang ngắt (vượt hạn mức ngân sách), chuyển sang phản hồi dự phòng');
      return null;
    }

    const opts: TuyChonHoi =
      typeof wordIdOrOpts === 'string' ? { wordId: wordIdOrOpts } : (wordIdOrOpts ?? {});

    if (opts.signal?.aborted) return null;
    if (!this.daCauHinh) return null;
    if (this.hongLuc !== null && Date.now() - this.hongLuc < NGUNG_SAU_LOI_MS) return null;

    const url = `${this.config.get<string>('AI_SERVICE_URL')}/assistant/ask`;
    const timeoutMs = opts.timeoutMs ?? this.timeoutNganMs;
    const start = Date.now();

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.config.get<string>('AI_SERVICE_KEY') ?? '',
        },
        body: JSON.stringify({ question }),
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
   * Gọi dịch vụ AI theo luồng (streaming).
   * - Nếu AI trả về text/event-stream thì đọc từng đoạn từ ReadableStream và đẩy ngay qua onDelta.
   * - Nếu AI trả về JSON một cục thì tự tách thành các cụm từ và phát qua onDelta để frontend vẫn hiện chữ dần.
   */
  async hoiTheoLuong(question: string, opts: TuyChonHoiTheoLuong): Promise<PhanHoiTroLy | null> {
    if (this.aiMonitor?.isCircuitBreakerOpen()) {
      this.logger.warn('Circuit Breaker đang ngắt (vượt hạn mức ngân sách), chuyển sang phản hồi dự phòng');
      return null;
    }

    if (opts.signal?.aborted) return null;
    if (!this.daCauHinh) return null;
    if (this.hongLuc !== null && Date.now() - this.hongLuc < NGUNG_SAU_LOI_MS) return null;

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
        body: JSON.stringify({ question }),
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
          for (const dong of khung.split('\n')) {
            if (!dong.startsWith('data:')) continue;
            const raw = dong.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;

            try {
              const parsed = JSON.parse(raw) as RawAiResponse & { delta?: unknown };
              if (typeof parsed.delta === 'string' && parsed.delta.length > 0) {
                answer += parsed.delta;
                opts.onDelta(parsed.delta);
              } else if (typeof parsed.answer === 'string' && parsed.answer.length > 0) {
                answer = parsed.answer;
              }
              const ids = this.docDanhSachNguon(parsed);
              if (ids.length > 0) sourceIds = ids;
            } catch {
              answer += raw;
              opts.onDelta(raw);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (answer.trim() === '') {
      this.logger.warn('Luong SSE ket thuc nhung answer rong');
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

  private khoiPhucNeuCan(): void {
    if (this.hongLuc !== null) {
      this.logger.log('Dich vu tro ly da tro lai');
      this.hongLuc = null;
    }
  }

  private danhDauHong(): null {
    this.hongLuc = Date.now();
    return null;
  }
}
