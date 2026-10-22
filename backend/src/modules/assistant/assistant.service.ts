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

export interface KetQuaHoiTroLy {
  answer: string;
  sources: NguonDan[];
  degraded: boolean;
  aborted?: boolean;
}

export type SuKienLuongTroLy =
  | { event: 'delta'; data: { text: string } }
  | {
      event: 'done';
      data: KetQuaHoiTroLy;
    };

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClient: AssistantClient,
  ) {}

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
          degraded: daTraLoi.degraded,
        };
      }
    }

    const cauHoiGuiAi = await this.ghepNguCanhTu(dto.question, dto.wordId);
    const batDau = Date.now();
    const phanHoi = await this.aiClient.hoi(cauHoiGuiAi, {
      wordId: dto.wordId,
      signal,
    });
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
        const ketQua = { answer, sources, degraded: daTraLoi.degraded };
        emit({ event: 'done', data: ketQua });
        return ketQua;
      }
    }

    const cauHoiGuiAi = await this.ghepNguCanhTu(dto.question, dto.wordId);
    const batDau = Date.now();
    let daPhatDelta = false;

    const phanHoi = await this.aiClient.hoiTheoLuong(cauHoiGuiAi, {
      wordId: dto.wordId,
      signal,
      onDelta: (chunk) => {
        if (signal?.aborted) return;
        daPhatDelta = true;
        emit({ event: 'delta', data: { text: chunk } });
      },
    });
    const durationMs = Date.now() - batDau;

    if (signal?.aborted) {
      return {
        answer: '',
        sources: [],
        degraded: false,
        aborted: true,
      };
    }

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

    const answer = phanHoi?.answer ?? CAU_TRA_LOI_DU_PHONG;
    const sources = await this.layNguon(phanHoi?.source_ids ?? []);
    const degraded = phanHoi === null;

    if (!daPhatDelta) {
      emit({ event: 'delta', data: { text: answer } });
    }
    const ketQua = { answer, sources, degraded };
    emit({ event: 'done', data: ketQua });
    return ketQua;
  }

  /**
   * Nếu câu hỏi được mở từ trong phiên ôn tập (có wordId), đính kèm thông tin từ
   * vào đầu câu hỏi gửi sang AI để trợ lý hiểu người học đang hỏi về từ nào,
   * nhưng vẫn giữ nguyên câu hỏi gốc khi lưu vào bảng assistant_queries.
   */
  private async ghepNguCanhTu(question: string, wordId?: string): Promise<string> {
    if (!wordId) return question;
    const word = await this.prisma.word?.findUnique?.({
      where: { id: wordId },
      select: { term: true, pos: true, meaningVi: true },
    });
    if (!word) return question;
    return `[Từ đang học: ${word.term} (${word.pos}) - ${word.meaningVi}] ${question}`;
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
