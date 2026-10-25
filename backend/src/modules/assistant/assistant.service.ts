import { Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AskAssistantDto } from './dto/ask-assistant.dto';
import { AssistantClient } from './assistant.client';

/** Khi AI không dùng được thì nói thẳng, tuyệt đối không bịa câu trả lời ngữ pháp */
const CAU_TRA_LOI_DU_PHONG =
  'Trợ lý đang tạm thời không trả lời được. Bạn thử lại sau ít phút, hoặc xem phần nghĩa và ví dụ ngay trên thẻ từ.';
/** Giới hạn lưu trữ lịch sử hội thoại: 30 ngày kể từ lần tương tác cuối */
export const HAN_LUU_HOI_THOAI_NGAY = 30;
const MOT_NGAY_MS = 24 * 60 * 60 * 1000;
const DO_DAI_TIEU_DE_TOI_DA = 60;
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

@Injectable()
export class AssistantService implements OnModuleInit, OnModuleDestroy {
  private boHenGioDonDep: NodeJS.Timeout | null = null;
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClient: AssistantClient,
  ) {}
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

    const conversationId = await this.damBaoHoiThoai(userId, dto.question, dto.conversationId);
    // Ghi cả lượt hỏng: không có answer thì vẫn biết người học đang vướng chỗ nào
    await this.prisma.assistantQuery.create({
      data: {
        userId,
        conversationId,
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

    const conversationId = await this.damBaoHoiThoai(userId, dto.question, dto.conversationId);

    await this.prisma.assistantQuery.create({
      data: {
        userId,
        conversationId,
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
    const ketQua: KetQuaHoiTroLy = { answer, sources, degraded, conversationId };
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
}
