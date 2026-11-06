import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiMonitorService } from '@modules/ai-monitor/ai-monitor.service';
import { InfraResilienceService } from '@modules/infra-resilience/infra-resilience.service';
import { PhanHoiDuBao, TheGuiAI } from './ai-scheduler.types';

/** Sau một lần gọi hỏng, tạm ngưng gọi AI trong khoảng này để không bắt người học chờ vô ích */
const NGUNG_SAU_LOI_MS = 30_000;

@Injectable()
export class AiSchedulerClient implements OnModuleInit {
  private readonly logger = new Logger(AiSchedulerClient.name);
  private hongLuc: number | null = null;
  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly aiMonitor?: AiMonitorService,
    @Optional() private readonly resilience?: InfraResilienceService,
  ) {}

  onModuleInit() {
    if (!this.daCauHinh) {
      this.logger.warn(
        'Chua cau hinh AI_SERVICE_URL/AI_SERVICE_KEY — moi luot on se dung cong thuc du phong',
      );
      return;
    }
    this.logger.log(`Dich vu AI: ${this.config.get<string>('AI_SERVICE_URL')}`);
  }
  private get daCauHinh(): boolean {
    return Boolean(
      this.config.get<string>('AI_SERVICE_URL') && this.config.get<string>('AI_SERVICE_KEY'),
    );
  }

  /** Trả kết quả dự báo, hoặc null khi không dùng được — null nghĩa là phải rơi về dự phòng. */
  async duBao(cards: TheGuiAI[]): Promise<PhanHoiDuBao | null> {
    if (this.aiMonitor?.isCircuitBreakerOpen()) {
      this.logger.warn(
        'Circuit Breaker đang ngắt (vượt hạn mức ngân sách), chuyển sang công thức dự phòng',
      );
      return null;
    }

    if (!this.daCauHinh) return null;

    // Sử dụng bộ đệm xử lý sự cố hạ tầng thông minh (WSEA-139)
    if (this.resilience) {
      return this.resilience.executeWithResilience(
        async () => {
          const res = await this.goiMotLan(cards);
          if (!res.ketQua) {
            throw new Error(
              res.nenThuLai ? 'AI service 503 (Cold Start)' : 'AI request rejected or failed',
            );
          }
          return this.danhDauSong(res.ketQua);
        },
        () => {
          this.danhDauHong();
          return null;
        },
        { serviceName: 'FSRS_RETENTION' },
      );
    }

    // Cơ chế fallback cơ bản nếu không có resilience service
    if (this.hongLuc !== null && Date.now() - this.hongLuc < NGUNG_SAU_LOI_MS) {
      return null;
    }

    const lanDau = await this.goiMotLan(cards);
    if (lanDau.ketQua) return this.danhDauSong(lanDau.ketQua);

    // Chỉ 503 mới đáng chờ: dịch vụ sống nhưng mô hình chưa nạp xong.
    if (lanDau.nenThuLai) {
      const delay = Number(this.config.get('AI_RETRY_DELAY_MS') ?? 2000);
      await new Promise((resolve) => setTimeout(resolve, delay));

      const lanHai = await this.goiMotLan(cards);
      if (lanHai.ketQua) return this.danhDauSong(lanHai.ketQua);
    }

    this.danhDauHong();
    return null;
  }

  private danhDauSong(ketQua: PhanHoiDuBao): PhanHoiDuBao {
    if (this.hongLuc !== null) {
      this.logger.log('Dich vu AI da tro lai');
      this.hongLuc = null;
    }
    return ketQua;
  }

  private danhDauHong(): void {
    if (this.hongLuc === null) {
      this.logger.warn(
        `Tam ngung goi dich vu AI trong ${NGUNG_SAU_LOI_MS / 1000}s, dung cong thuc du phong`,
      );
    }
    this.hongLuc = Date.now();
  }

  private async goiMotLan(
    cards: TheGuiAI[],
  ): Promise<{ ketQua: PhanHoiDuBao | null; nenThuLai: boolean }> {
    const url = this.config.getOrThrow<string>('AI_SERVICE_URL');
    const key = this.config.getOrThrow<string>('AI_SERVICE_KEY');
    const timeoutMs = Number(this.config.get('AI_TIMEOUT_MS') ?? 3000);
    const start = Date.now();

    try {
      const response = await fetch(`${url}/predict-retention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ cards }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const latencyMs = Date.now() - start;

      if (response.ok) {
        const ketQua = (await response.json()) as PhanHoiDuBao;
        this.aiMonitor?.recordCall({
          serviceType: 'FSRS_RETENTION',
          promptTokens: Math.max(cards.length * 20, 10),
          completionTokens: Math.max(cards.length * 10, 5),
          latencyMs,
          success: true,
          statusCode: response.status,
        });
        return { ketQua, nenThuLai: false };
      }

      this.aiMonitor?.recordCall({
        serviceType: 'FSRS_RETENTION',
        promptTokens: Math.max(cards.length * 20, 10),
        completionTokens: 0,
        latencyMs,
        success: false,
        statusCode: response.status,
      });

      // Bảng mã lỗi của API_CONTRACT.md v0.2
      if (response.status === 401) {
        this.logger.error('AI_SERVICE_KEY sai hoặc thiếu — kiểm tra biến môi trường');
      } else if (response.status === 422) {
        this.logger.error(`Dịch vụ AI từ chối dữ liệu: ${await response.text()}`);
      } else {
        this.logger.warn(`Dịch vụ AI trả mã ${response.status}`);
      }

      return { ketQua: null, nenThuLai: response.status === 503 };
    } catch (error) {
      const latencyMs = Date.now() - start;
      this.aiMonitor?.recordCall({
        serviceType: 'FSRS_RETENTION',
        promptTokens: Math.max(cards.length * 20, 10),
        completionTokens: 0,
        latencyMs,
        success: false,
        statusCode: 500,
      });
      this.logger.warn(`Không gọi được dịch vụ AI: ${String(error)}`);
      return { ketQua: null, nenThuLai: false };
    }
  }
}
