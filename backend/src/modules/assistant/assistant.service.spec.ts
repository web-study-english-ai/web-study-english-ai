import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { AssistantService } from './assistant.service';
import { AssistantClient } from './assistant.client';

const prismaMock = {
  assistantQuery: { findUnique: vi.fn(), create: vi.fn() },
  kbChunk: { findMany: vi.fn() },
};
const aiMock = { hoi: vi.fn() };

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
    aiMock.hoi.mockResolvedValue(null);

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

    it('truyền wordId xuống AI và lưu vào log', async () => {
      await service.ask(USER_ID, { question: 'Từ này dùng sao?', wordId: WORD_ID });
      expect(aiMock.hoi).toHaveBeenCalledWith('Từ này dùng sao?', WORD_ID);
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
});