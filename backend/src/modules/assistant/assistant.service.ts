import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AskAssistantDto } from './dto/ask-assistant.dto';
import { AssistantClient } from './assistant.client';

/** Khi AI không dùng được thì nói thẳng, tuyệt đối không bịa câu trả lời ngữ pháp */
const CAU_TRA_LOI_DU_PHONG =
  'Trợ lý đang tạm thời không trả lời được. Bạn thử lại sau ít phút, hoặc xem phần nghĩa và ví dụ ngay trên thẻ từ.';

export interface NguonDan {
  id: string;
  source: string;
  topic: string | null;
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClient: AssistantClient,
  ) {}

  async ask(userId: string, dto: AskAssistantDto) {
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
          degraded: daTraLoi.degraded,
        };
      }
    }

    const batDau = Date.now();
    const phanHoi = await this.aiClient.hoi(dto.question, dto.wordId);
    const durationMs = Date.now() - batDau;

    // Ghi cả lượt hỏng: không có answer thì vẫn biết người học đang vướng chỗ nào
    await this.prisma.assistantQuery.create({
      data: {
        userId,
        question: dto.question,
        answer: phanHoi?.answer ?? null,
        wordId: dto.wordId ?? null,
        sourceIds: phanHoi?.source_ids ?? [],
        degraded: phanHoi === null,
        durationMs,
        clientEventId: dto.clientEventId ?? null,
      },
    });

    return {
      answer: phanHoi?.answer ?? CAU_TRA_LOI_DU_PHONG,
      sources: await this.layNguon(phanHoi?.source_ids ?? []),
      degraded: phanHoi === null,
    };
  }

  /** Lấy metadata đoạn tri thức, select tường minh để không kéo 768 số embedding về client */
  private async layNguon(ids: string[]): Promise<NguonDan[]> {
    if (ids.length === 0) return [];
    return this.prisma.kbChunk.findMany({
      where: { id: { in: ids } },
      select: { id: true, source: true, topic: true },
    });
  }
}
