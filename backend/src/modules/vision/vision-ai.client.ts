import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiMonitorService } from '@modules/ai-monitor/ai-monitor.service';
import { InfraResilienceService } from '@modules/infra-resilience/infra-resilience.service';
import { NhanAiTraVe, PhanHoiNhanDienAi, TepAnhTaiLen } from './vision.types';

/** Tạm ngưng gọi lại dịch vụ AI trong 30 giây sau khi xác nhận dịch vụ đang sập */
const NGUNG_SAU_LOI_MS = 30_000;

@Injectable()
export class VisionAiClient implements OnModuleInit {
  private readonly logger = new Logger(VisionAiClient.name);
  private hongLuc: number | null = null;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly aiMonitor?: AiMonitorService,
    @Optional() private readonly resilience?: InfraResilienceService,
  ) {}

  onModuleInit() {
    if (!this.daCauHinh) {
      this.logger.warn(
        'Chưa cấu hình AI_SERVICE_URL/AI_SERVICE_KEY — chức năng nhận diện ảnh sẽ báo dự phòng',
      );
    }
  }

  private get daCauHinh(): boolean {
    return Boolean(
      this.config.get<string>('AI_SERVICE_URL') && this.config.get<string>('AI_SERVICE_KEY'),
    );
  }

  /**
   * Gửi ảnh sang dịch vụ AI (POST /recognize/image theo hợp đồng v0.4).
   * Trả về null nếu dịch vụ AI không khả dụng để tầng service bật cờ degraded.
   */
  async nhanDienAnh(file: TepAnhTaiLen): Promise<PhanHoiNhanDienAi | null> {
    if (this.aiMonitor?.isCircuitBreakerOpen()) {
      this.logger.warn('Circuit Breaker đang ngắt, tạm dừng gọi AI nhận diện ảnh');
      return null;
    }

    if (!this.daCauHinh) return null;

    if (this.resilience) {
      return this.resilience.executeWithResilience(
        async () => {
          const res = await this.goiMotLan(file);
          if (!res.ketQua) {
            throw new Error(
              res.nenThuLai ? 'AI vision 503 (Cold Start)' : 'AI vision request failed',
            );
          }
          return this.danhDauSong(res.ketQua);
        },
        () => {
          this.danhDauHong();
          return null;
        },
        { serviceName: 'VISION_CLIP' },
      );
    }

    if (this.hongLuc !== null && Date.now() - this.hongLuc < NGUNG_SAU_LOI_MS) {
      return null;
    }

    const lanDau = await this.goiMotLan(file);
    if (lanDau.ketQua) return this.danhDauSong(lanDau.ketQua);

    if (lanDau.nenThuLai) {
      const delay = Number(this.config.get('AI_RETRY_DELAY_MS') ?? 2000);
      await new Promise((resolve) => setTimeout(resolve, delay));

      const lanHai = await this.goiMotLan(file);
      if (lanHai.ketQua) return this.danhDauSong(lanHai.ketQua);
    }

    this.danhDauHong();
    return null;
  }

  private danhDauSong(ketQua: PhanHoiNhanDienAi): PhanHoiNhanDienAi {
    if (this.hongLuc !== null) {
      this.logger.log('Dịch vụ AI nhận diện ảnh đã hoạt động trở lại');
      this.hongLuc = null;
    }
    return ketQua;
  }

  private danhDauHong(): void {
    if (this.hongLuc === null) {
      this.logger.warn(
        `Tạm ngưng gọi AI nhận diện ảnh trong ${NGUNG_SAU_LOI_MS / 1000}s, chuyển sang chế độ dự phòng`,
      );
    }
    this.hongLuc = Date.now();
  }

  private async goiMotLan(
    file: TepAnhTaiLen,
  ): Promise<{ ketQua: PhanHoiNhanDienAi | null; nenThuLai: boolean }> {
    const baseUrl = this.config.getOrThrow<string>('AI_SERVICE_URL').replace(/\/+$/, '');
    const key = this.config.getOrThrow<string>('AI_SERVICE_KEY');
    const timeoutMs = Number(this.config.get('AI_VISION_TIMEOUT_MS') ?? 8000);
    const endpoint = this.config.get<string>('AI_VISION_PATH') ?? '/recognize/image';
    const start = Date.now();

    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(file.buffer)], {
        type: file.mimetype || 'image/jpeg',
      });
      formData.append('image', blob, file.originalname || 'upload.jpg');

      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'x-api-key': key },
        body: formData,
        signal: AbortSignal.timeout(timeoutMs),
      });

      const latencyMs = Date.now() - start;

      if (response.ok) {
        const body = (await response.json()) as Record<string, unknown>;
        const ketQua = this.chuanHoaPhanHoi(body, latencyMs);

        this.aiMonitor?.recordCall({
          serviceType: 'VISION_CLIP',
          promptTokens: 50,
          completionTokens: Math.max(ketQua.items.length * 5, 5),
          latencyMs,
          success: true,
          statusCode: response.status,
        });

        return { ketQua, nenThuLai: false };
      }

      this.aiMonitor?.recordCall({
        serviceType: 'VISION_CLIP',
        promptTokens: 50,
        completionTokens: 0,
        latencyMs,
        success: false,
        statusCode: response.status,
      });

      this.logger.warn(`Dịch vụ AI nhận diện ảnh trả mã lỗi ${response.status}`);
      return { ketQua: null, nenThuLai: response.status === 503 };
    } catch (error) {
      const latencyMs = Date.now() - start;
      this.aiMonitor?.recordCall({
        serviceType: 'VISION_CLIP',
        promptTokens: 50,
        completionTokens: 0,
        latencyMs,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      this.logger.warn(`Lỗi kết nối dịch vụ AI nhận diện ảnh: ${String(error)}`);
      return { ketQua: null, nenThuLai: false };
    }
  }

  /**
   * Chuẩn hoá phản hồi từ AI v0.4 (hỗ trợ cả results / predictions / items và score / confidence)
   */
  private chuanHoaPhanHoi(
    body: Record<string, unknown>,
    fallbackLatencyMs: number,
  ): PhanHoiNhanDienAi {
    const danhSachTho =
      (Array.isArray(body.labels) && body.labels) ||
      (Array.isArray(body.results) && body.results) ||
      (Array.isArray(body.predictions) && body.predictions) ||
      (Array.isArray(body.items) && body.items) ||
      [];

    const items: NhanAiTraVe[] = [];
    for (const phanTu of danhSachTho) {
      if (!phanTu || typeof phanTu !== 'object') continue;
      const obj = phanTu as Record<string, unknown>;
      const rawWord = typeof obj.word === 'string' ? obj.word : obj.term;
      const rawScore = typeof obj.score === 'number' ? obj.score : obj.confidence;

      if (typeof rawWord === 'string' && rawWord.trim().length > 0) {
        const score = typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : 0;
        items.push({
          word: rawWord.trim().toLowerCase(),
          score,
        });
      }
    }

    const tau = typeof body.tau === 'number' && Number.isFinite(body.tau) ? body.tau : null;
    const lowConfidence =
      typeof body.low_confidence === 'boolean'
        ? body.low_confidence
        : typeof body.lowConfidence === 'boolean'
          ? body.lowConfidence
          : items.length === 0 || (tau !== null && (items[0]?.score ?? 0) < tau);

    const latencyMs =
      typeof body.latency_ms === 'number' && Number.isFinite(body.latency_ms)
        ? body.latency_ms
        : fallbackLatencyMs;

    return {
      items: items.slice(0, 10),
      lowConfidence,
      tau,
      latencyMs,
    };
  }
}
