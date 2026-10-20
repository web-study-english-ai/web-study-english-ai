import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TIMEOUT_MS = 15_000;
/** Sau một lần gọi hỏng, tạm ngưng gọi AI trong khoảng này */
const NGUNG_SAU_LOI_MS = 30_000;

export interface PhanHoiTroLy {
  answer: string;
  source_ids: string[];
}

@Injectable()
export class AssistantClient implements OnModuleInit {
  private readonly logger = new Logger(AssistantClient.name);
  private hongLuc: number | null = null;

  constructor(private readonly config: ConfigService) {}

  private get daCauHinh(): boolean {
    return Boolean(this.config.get('AI_SERVICE_URL') && this.config.get('AI_SERVICE_KEY'));
  }

  onModuleInit(): void {
    if (!this.daCauHinh) {
      this.logger.warn('Chua cau hinh AI_SERVICE_URL/AI_SERVICE_KEY, tro ly chay che do du phong');
    }
  }

  async hoi(question: string, wordId?: string): Promise<PhanHoiTroLy | null> {
    if (!this.daCauHinh) return null;
    if (this.hongLuc !== null && Date.now() - this.hongLuc < NGUNG_SAU_LOI_MS) return null;

    // TODO: chốt lại đường dẫn và tên trường với Hiếu, chỉ sửa trong hàm này
    const url = `${this.config.get<string>('AI_SERVICE_URL')}/assistant/ask`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.config.get<string>('AI_SERVICE_KEY') ?? '',
        },
        body: JSON.stringify({ question, word_id: wordId ?? null }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        this.logger.warn(`Dich vu tro ly tra ve ${res.status}`);
        return this.danhDauHong();
      }

      const data = (await res.json()) as Partial<PhanHoiTroLy>;
      if (typeof data.answer !== 'string' || data.answer.trim() === '') {
        this.logger.warn('Dich vu tro ly tra ve answer rong');
        return this.danhDauHong();
      }

      if (this.hongLuc !== null) {
        this.logger.log('Dich vu tro ly da tro lai');
        this.hongLuc = null;
      }
      return {
        answer: data.answer,
        source_ids: Array.isArray(data.source_ids) ? data.source_ids : [],
      };
    } catch (e) {
      this.logger.warn(
        `Khong goi duoc dich vu tro ly: ${e instanceof Error ? e.message : 'loi la'}`,
      );
      return this.danhDauHong();
    }
  }

  private danhDauHong(): null {
    this.hongLuc = Date.now();
    return null;
  }
}
