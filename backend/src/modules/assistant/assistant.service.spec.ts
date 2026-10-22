import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { AssistantService, SuKienLuongTroLy } from './assistant.service';
import { AssistantClient, TuyChonHoiTheoLuong } from './assistant.client';

const prismaMock = {
  assistantQuery: { findUnique: vi.fn(), create: vi.fn() },
  kbChunk: { findMany: vi.fn() },
  word: { findUnique: vi.fn() },
};
const aiMock = { hoi: vi.fn(), hoiTheoLuong: vi.fn() };

const USER_ID = 'user-1';
const WORD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const CHUNK_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const nguon = { id: CHUNK_ID, source: 'Oxford Grammar', topic: 'tenses' };

const duLieuGhi = () => prismaMock.assistantQuery.create.mock.calls[0][0].data;

describe('AssistantService', () => {
  let service: AssistantService;

  beforeEach(async () => {
    vi.clearAllMocks();
    prismaMock.assistantQuery.findUnique.mockResolvedValue(null);
    prismaMock.assistantQuery.create.mockResolvedValue({});
    prismaMock.kbChunk.findMany.mockResolvedValue([nguon]);
    prismaMock.word.findUnique.mockResolvedValue(null);
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

  describe('AI trả lời được', () => {
    beforeEach(() => {
      aiMock.hoi.mockResolvedValue({ answer: 'Dùng khi...', source_ids: [CHUNK_ID] });
    });

    it('trả câu trả lời của AI kèm nguồn, degraded = false', async () => {
      const kq = await service.ask(USER_ID, { question: 'Present perfect?' });
      expect(kq).toEqual({ answer: 'Dùng khi...', sources: [nguon], degraded: false });
    });

    it('ghi log đủ câu trả lời, id nguồn và thời gian xử lý', async () => {
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

    it('ghép ngữ cảnh từ đang học khi có wordId nhưng vẫn lưu câu hỏi gốc vào log', async () => {
      prismaMock.word.findUnique.mockResolvedValue({
        term: 'abandon',
        pos: 'VERB',
        meaningVi: 'từ bỏ',
      });
      await service.ask(USER_ID, { question: 'Từ này dùng sao?', wordId: WORD_ID });
      expect(aiMock.hoi).toHaveBeenCalledWith(
        '[Từ đang học: abandon (VERB) - từ bỏ] Từ này dùng sao?',
        expect.objectContaining({ wordId: WORD_ID }),
      );
      expect(duLieuGhi().question).toBe('Từ này dùng sao?');
      expect(duLieuGhi().wordId).toBe(WORD_ID);
    });
  });

  describe('AI không trả lời được', () => {
    it('trả câu dự phòng, sources rỗng, degraded = true', async () => {
      const kq = await service.ask(USER_ID, { question: 'Present perfect?' });
      expect(kq.degraded).toBe(true);
      expect(kq.sources).toEqual([]);
      expect(kq.answer).toContain('tạm thời không trả lời được');
    });

    it('vẫn ghi log với answer = null để biết người học đang hỏi gì', async () => {
      await service.ask(USER_ID, { question: 'Present perfect?' });
      expect(duLieuGhi()).toMatchObject({ answer: null, sourceIds: [], degraded: true });
    });

    it('không truy vấn kb_chunks khi không có nguồn', async () => {
      await service.ask(USER_ID, { question: 'Present perfect?' });
      expect(prismaMock.kbChunk.findMany).not.toHaveBeenCalled();
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

      expect(kq).toEqual({ answer: 'Câu cũ', sources: [nguon], degraded: false });
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
          },
        },
      ]);
      expect(prismaMock.assistantQuery.create).toHaveBeenCalledOnce();
    });

    it('khi AI lỗi trong luồng thì phát câu dự phòng và done với degraded = true', async () => {
      aiMock.hoiTheoLuong.mockResolvedValue(null);

      const suKienList: SuKienLuongTroLy[] = [];
      await service.askStream(USER_ID, { question: 'Present perfect?' }, (sk) =>
        suKienList.push(sk),
      );

      expect(suKienList).toHaveLength(2);
      expect(suKienList[0].event).toBe('delta');
      expect(suKienList[1]).toMatchObject({
        event: 'done',
        data: { sources: [], degraded: true },
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
});
