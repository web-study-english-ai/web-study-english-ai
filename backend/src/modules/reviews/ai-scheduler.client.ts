import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhanHoiDuBao, TheGuiAI } from './ai-scheduler.types';

@Injectable()
export class AiSchedulerClient implements OnModuleInit {
  private readonly logger = new Logger(AiSchedulerClient.name);

  constructor(private readonly config: ConfigService) {}

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
    if (!this.daCauHinh) return null;

    const lanDau = await this.goiMotLan(cards);
    if (lanDau.ketQua) return lanDau.ketQua;

    // Chỉ 503 mới đáng chờ: dịch vụ sống nhưng mô hình chưa nạp xong.
    // Hết thời gian chờ nghĩa là không ai trả lời, chờ thêm chỉ phí thời gian người học.
    if (lanDau.nenThuLai) {
      const delay = Number(this.config.get('AI_RETRY_DELAY_MS') ?? 2000);
      await new Promise((resolve) => setTimeout(resolve, delay));

      const lanHai = await this.goiMotLan(cards);
      if (lanHai.ketQua) return lanHai.ketQua;
    }

    return null;
  }

  private async goiMotLan(
    cards: TheGuiAI[],
  ): Promise<{ ketQua: PhanHoiDuBao | null; nenThuLai: boolean }> {
    const url = this.config.getOrThrow<string>('AI_SERVICE_URL');
    const key = this.config.getOrThrow<string>('AI_SERVICE_KEY');
    const timeoutMs = Number(this.config.get('AI_TIMEOUT_MS') ?? 3000);

    try {
      const response = await fetch(`${url}/predict-retention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ cards }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        return { ketQua: (await response.json()) as PhanHoiDuBao, nenThuLai: false };
      }

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
      this.logger.warn(`Không gọi được dịch vụ AI: ${String(error)}`);
      return { ketQua: null, nenThuLai: false };
    }
  }
}
