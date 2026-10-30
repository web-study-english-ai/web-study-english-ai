import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { AssistantService, SuKienLuongTroLy } from './assistant.service';
import {
  AssistantClient,
  MODEL_EMBED_MAC_DINH,
  SO_CHIEU_VECTOR_CHUAN,
  TuyChonHoiTheoLuong,
} from './assistant.client';

const prismaMock = {
  assistantQuery: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  kbChunk: { findMany: vi.fn() },
  word: { findUnique: vi.fn(), findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  conversation: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
};

const aiMock = {
  nhungCauHoi: vi.fn(),
  hoi: vi.fn(),
  hoiTheoLuong: vi.fn(),
};

const USER_ID = 'user-1';
const WORD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const CHUNK_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const nguon = { id: CHUNK_ID, source: 'Oxford Grammar', topic: 'tenses' };
const vectorGia = Array.from({ length: SO_CHIEU_VECTOR_CHUAN }, () => 0.05);

const duLieuGhi = () => prismaMock.assistantQuery.create.mock.calls[0][0].data;

describe('AssistantService (Hợp đồng API v0.3)', () => {
  let service: AssistantService;

  beforeEach(async () => {
    vi.clearAllMocks();
    prismaMock.assistantQuery.findUnique.mockResolvedValue(null);
    prismaMock.assistantQuery.findMany.mockResolvedValue([]);
    prismaMock.assistantQuery.create.mockResolvedValue({});
    prismaMock.kbChunk.findMany.mockResolvedValue([nguon]);
    prismaMock.word.findUnique.mockResolvedValue(null);
    prismaMock.word.findMany.mockResolvedValue([]);
    prismaMock.user.findUnique.mockResolvedValue({ level: 'B1' });
    prismaMock.conversation.create.mockResolvedValue({ id: 'conv-1' });
    prismaMock.conversation.update.mockResolvedValue({ id: 'conv-1' });
    prismaMock.conversation.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          id: CHUNK_ID,
          content: 'Hiện tại hoàn thành dùng để...',
          source: 'Oxford Grammar',
          topic: 'tenses',
          cefr: 'B1',
          distance: 0.14,
        },
      ])
      .mockResolvedValueOnce([]);

    aiMock.nhungCauHoi.mockResolvedValue({
      embedding: vectorGia,
      model: MODEL_EMBED_MAC_DINH,
      dim: SO_CHIEU_VECTOR_CHUAN,
    });
    aiMock.hoi.mockResolvedValue(null);
    aiMock.hoiTheoLuong.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AssistantClient, useValue: aiMock },
      ],
    }).compile();

    service = module.get<AssistantService>(AssistantService);
  });

  describe('AI trả lời được (luồng 3 bước: embed -> pgvector -> ask)', () => {
    beforeEach(() => {
      aiMock.hoi.mockResolvedValue({
        answer: 'Dùng khi...',
        source_ids: [CHUNK_ID, 'id-la-khong-co-trong-contexts'],
      });
    });

    it('trả câu trả lời của AI kèm nguồn hợp lệ (lọc source_ids ⊂ contexts), degraded = false', async () => {
      const kq = await service.ask(USER_ID, { question: 'Present perfect?' });
      expect(kq).toEqual({
        answer: 'Dùng khi...',
        sources: [nguon],
        degraded: false,
        conversationId: 'conv-1',
      });
    });

    it('ghi log đủ câu trả lời, id nguồn đã lọc và thời gian xử lý', async () => {
      await service.ask(USER_ID, { question: 'Present perfect?' });
      expect(duLieuGhi()).toMatchObject({
        userId: USER_ID,
        question: 'Present perfect?',
        answer: 'Dùng khi...',
        sourceIds: [CHUNK_ID],
        degraded: false,
      });
      expect(typeof duLieuGhi().durationMs).toBe('number');
    });

    it('lấy nguồn bằng select tường minh, không kéo cột embedding', async () => {
      await service.ask(USER_ID, { question: 'Present perfect?' });
      expect(prismaMock.kbChunk.findMany).toHaveBeenCalledWith({
        where: { id: { in: [CHUNK_ID] } },
        select: { id: true, source: true, topic: true },
      });
    });

    it('nối (<term>) khi gọi /embed và truyền word: { term, pos, meaning_vi } sang /ask khi có wordId', async () => {
      prismaMock.word.findUnique.mockResolvedValue({
        term: 'abandon',
        pos: 'VERB',
        meaningVi: 'từ bỏ',
        exampleEn: 'Never abandon hope.',
      });
      await service.ask(USER_ID, { question: 'Từ này dùng sao?', wordId: WORD_ID });

      expect(aiMock.nhungCauHoi).toHaveBeenCalledWith(
        'Từ này dùng sao? (abandon)',
        expect.anything(),
      );
      expect(aiMock.hoi).toHaveBeenCalledWith(
        'Từ này dùng sao?',
        expect.objectContaining({
          word: { term: 'abandon', pos: 'VERB', meaning_vi: 'từ bỏ' },
          userCefr: 'B1',
        }),
      );
      expect(duLieuGhi().question).toBe('Từ này dùng sao?');
      expect(duLieuGhi().wordId).toBe(WORD_ID);
    });
  });

  describe('Fallback khi AI không trả lời được', () => {
    it('khi /embed lỗi hoặc lệch model: không truy vấn pgvector, trả câu dự phòng và sources rỗng', async () => {
      aiMock.nhungCauHoi.mockResolvedValue(null);
      const kq = await service.ask(USER_ID, { question: 'Present perfect?' });

      expect(kq.degraded).toBe(true);
      expect(kq.sources).toEqual([]);
      expect(kq.answer).toContain('tạm thời không trả lời được');
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
      expect(aiMock.hoi).not.toHaveBeenCalled();
    });

    it('khi /ask lỗi nhưng đã truy hồi được pgvector: trả câu dự phòng kèm tối đa 3 nguồn đầu đã truy hồi', async () => {
      prismaMock.$queryRaw.mockReset();
      prismaMock.$queryRaw
        .mockResolvedValueOnce([
          { id: 'c-1', content: 'A', source: 'Nguồn 1', topic: 't1', cefr: 'A1', distance: 0.1 },
          { id: 'c-2', content: 'B', source: 'Nguồn 2', topic: 't2', cefr: 'A2', distance: 0.12 },
          { id: 'c-3', content: 'C', source: 'Nguồn 3', topic: 't3', cefr: 'B1', distance: 0.15 },
          { id: 'c-4', content: 'D', source: 'Nguồn 4', topic: 't4', cefr: 'B2', distance: 0.18 },
        ])
        .mockResolvedValueOnce([]);
      aiMock.hoi.mockResolvedValue(null);

      const kq = await service.ask(USER_ID, { question: 'Present perfect?' });
      expect(kq.degraded).toBe(true);
      expect(kq.answer).toContain('tạm thời không trả lời được');
      expect(kq.sources).toEqual([
        { id: 'c-1', source: 'Nguồn 1', topic: 't1' },
        { id: 'c-2', source: 'Nguồn 2', topic: 't2' },
        { id: 'c-3', source: 'Nguồn 3', topic: 't3' },
      ]);
      expect(duLieuGhi()).toMatchObject({
        answer: null,
        sourceIds: ['c-1', 'c-2', 'c-3'],
        degraded: true,
      });
    });
  });

  describe('chống gửi trùng bằng clientEventId', () => {
    it('đã có bản ghi thì trả lại, không gọi AI, không ghi thêm', async () => {
      prismaMock.assistantQuery.findUnique.mockResolvedValue({
        answer: 'Câu cũ',
        sourceIds: [CHUNK_ID],
        degraded: false,
      });

      const kq = await service.ask(USER_ID, { question: 'Hỏi lại', clientEventId: EVENT_ID });

      expect(kq).toEqual({
        answer: 'Câu cũ',
        sources: [nguon],
        degraded: false,
        conversationId: null,
      });
      expect(aiMock.nhungCauHoi).not.toHaveBeenCalled();
      expect(aiMock.hoi).not.toHaveBeenCalled();
      expect(prismaMock.assistantQuery.create).not.toHaveBeenCalled();
    });

    it('bản ghi cũ bị degraded thì trả lại câu dự phòng', async () => {
      prismaMock.assistantQuery.findUnique.mockResolvedValue({
        answer: null,
        sourceIds: [],
        degraded: true,
      });

      const kq = await service.ask(USER_ID, { question: 'Hỏi lại', clientEventId: EVENT_ID });

      expect(kq.degraded).toBe(true);
      expect(kq.answer).toContain('tạm thời không trả lời được');
    });

    it('mã mới thì gọi AI và lưu clientEventId', async () => {
      await service.ask(USER_ID, { question: 'Câu mới', clientEventId: EVENT_ID });
      expect(prismaMock.assistantQuery.findUnique).toHaveBeenCalledWith({
        where: { clientEventId: EVENT_ID },
      });
      expect(aiMock.hoi).toHaveBeenCalled();
      expect(duLieuGhi().clientEventId).toBe(EVENT_ID);
    });

    it('không gửi clientEventId thì không tra bảng, lưu null', async () => {
      await service.ask(USER_ID, { question: 'Câu mới' });
      expect(prismaMock.assistantQuery.findUnique).not.toHaveBeenCalled();
      expect(duLieuGhi().clientEventId).toBeNull();
    });
  });

  describe('hỏi đáp theo luồng (askStream)', () => {
    it('phát từng sự kiện delta rồi kết thúc bằng done kèm nguồn tham chiếu', async () => {
      aiMock.hoiTheoLuong.mockImplementation((_q: string, opts: TuyChonHoiTheoLuong) => {
        opts.onDelta('Thì hiện tại hoàn thành ');
        opts.onDelta('dùng để diễn tả...');
        return Promise.resolve({
          answer: 'Thì hiện tại hoàn thành dùng để diễn tả...',
          source_ids: [CHUNK_ID],
        });
      });

      const suKienList: SuKienLuongTroLy[] = [];
      await service.askStream(USER_ID, { question: 'Present perfect?' }, (sk) =>
        suKienList.push(sk),
      );

      expect(suKienList).toEqual([
        { event: 'delta', data: { text: 'Thì hiện tại hoàn thành ' } },
        { event: 'delta', data: { text: 'dùng để diễn tả...' } },
        {
          event: 'done',
          data: {
            answer: 'Thì hiện tại hoàn thành dùng để diễn tả...',
            sources: [nguon],
            degraded: false,
            conversationId: 'conv-1',
          },
        },
      ]);
      expect(prismaMock.assistantQuery.create).toHaveBeenCalledOnce();
    });

    it('khi /ask lỗi trong luồng thì phát câu dự phòng và done với degraded = true kèm nguồn đã truy hồi', async () => {
      aiMock.hoiTheoLuong.mockResolvedValue(null);

      const suKienList: SuKienLuongTroLy[] = [];
      await service.askStream(USER_ID, { question: 'Present perfect?' }, (sk) =>
        suKienList.push(sk),
      );

      expect(suKienList).toHaveLength(2);
      expect(suKienList[0].event).toBe('delta');
      expect(suKienList[1]).toMatchObject({
        event: 'done',
        data: { sources: [nguon], degraded: true },
      });
    });

    it('ngắt kết nối giữa chừng (AbortSignal) thì dừng ngay và không ghi log lỗi', async () => {
      const controller = new AbortController();
      aiMock.hoiTheoLuong.mockImplementation(() => {
        controller.abort();
        return Promise.resolve(null);
      });

      const suKienList: SuKienLuongTroLy[] = [];
      const kq = await service.askStream(
        USER_ID,
        { question: 'Present perfect?' },
        (sk) => suKienList.push(sk),
        controller.signal,
      );

      expect(kq.aborted).toBe(true);
      expect(prismaMock.assistantQuery.create).not.toHaveBeenCalled();
      expect(suKienList).toHaveLength(0);
    });
  });

  describe('lịch sử hội thoại (WSEA-129)', () => {
    const CONV_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    it('tự tạo hội thoại mới khi hỏi lần đầu không kèm conversationId', async () => {
      prismaMock.conversation.create.mockResolvedValue({ id: CONV_ID });
      const kq = await service.ask(USER_ID, { question: 'Câu hỏi đầu tiên' });
      expect(prismaMock.conversation.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, title: 'Câu hỏi đầu tiên' },
        select: { id: true },
      });
      expect(kq.conversationId).toBe(CONV_ID);
      expect(duLieuGhi().conversationId).toBe(CONV_ID);
    });
    it('nối vào hội thoại có sẵn khi đúng chủ sở hữu và chưa quá hạn 30 ngày', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        id: CONV_ID,
        userId: USER_ID,
        updatedAt: new Date(),
      });
      const kq = await service.ask(USER_ID, {
        question: 'Câu hỏi tiếp theo',
        conversationId: CONV_ID,
      });
      expect(prismaMock.conversation.update).toHaveBeenCalled();
      expect(kq.conversationId).toBe(CONV_ID);
    });
    it('chặn truy cập hội thoại của người dùng khác (ném 404)', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        id: CONV_ID,
        userId: 'user-khac',
        updatedAt: new Date(),
      });
      await expect(service.getConversation(USER_ID, CONV_ID)).rejects.toThrow(NotFoundException);
      await expect(service.deleteConversation(USER_ID, CONV_ID)).rejects.toThrow(NotFoundException);
    });
    it('chặn xem hội thoại đã quá hạn lưu trữ 30 ngày (ném 404)', async () => {
      const qua31Ngay = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      prismaMock.conversation.findUnique.mockResolvedValue({
        id: CONV_ID,
        userId: USER_ID,
        updatedAt: qua31Ngay,
        messages: [],
      });
      await expect(service.getConversation(USER_ID, CONV_ID)).rejects.toThrow(NotFoundException);
    });
    it('dọn dẹp hội thoại quá hạn 30 ngày bằng deleteMany', async () => {
      prismaMock.conversation.deleteMany.mockResolvedValue({ count: 3 });
      const daXoa = await service.donDepHoiThoaiQuaHan();
      expect(daXoa).toBe(3);
      expect(prismaMock.conversation.deleteMany).toHaveBeenCalledOnce();
    });
  });
});
