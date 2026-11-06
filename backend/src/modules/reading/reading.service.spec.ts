import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CefrLevel, ReadingAttemptStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ReadingService } from './reading.service';

const prismaMock = {
  readingPassage: {
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
  },
  readingAttempt: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
};

const USER_ID = 'user-1';
const PASSAGE_ID = '11111111-1111-4111-8111-111111111111';

describe('ReadingService', () => {
  let service: ReadingService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReadingService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<ReadingService>(ReadingService);
  });

  describe('listReadings', () => {
    it('trả về danh sách bài đọc kèm tiến độ NOT_STARTED, IN_PROGRESS, COMPLETED và phân trang', async () => {
      prismaMock.readingPassage.findMany
        .mockResolvedValueOnce([
          {
            id: 'p-1',
            slug: 'the-path-to-cognitive-mastery',
            title: 'The Path to Cognitive Mastery',
            summary: 'Khám phá cách ghi nhớ chủ động.',
            topic: 'Giáo dục',
            cefr: CefrLevel.B1,
            estimatedMinutes: 15,
            _count: { questions: 4 },
            attempts: [
              {
                status: ReadingAttemptStatus.IN_PROGRESS,
                answeredCount: 2,
                correctCount: null,
                totalQuestions: 4,
                durationSeconds: 95,
              },
            ],
          },
          {
            id: 'p-2',
            slug: 'a-day-in-my-life',
            title: 'A Day in My Life',
            summary: 'Những thói quen hằng ngày.',
            topic: 'Cuộc sống',
            cefr: CefrLevel.A1,
            estimatedMinutes: 5,
            _count: { questions: 5 },
            attempts: [
              {
                status: ReadingAttemptStatus.COMPLETED,
                answeredCount: 5,
                correctCount: 5,
                totalQuestions: 5,
                durationSeconds: 180,
              },
            ],
          },
          {
            id: 'p-3',
            slug: 'a-weekend-in-london',
            title: 'A Weekend in London',
            summary: 'Trải nghiệm một cuối tuần ở London.',
            topic: 'Du lịch',
            cefr: CefrLevel.A2,
            estimatedMinutes: 8,
            _count: { questions: 6 },
            attempts: [],
          },
        ])
        .mockResolvedValueOnce([
          { topic: 'Cuộc sống' },
          { topic: 'Du lịch' },
          { topic: 'Giáo dục' },
        ]);
      prismaMock.readingPassage.count.mockResolvedValue(3);

      const kq = await service.listReadings(USER_ID, {
        page: 1,
        limit: 5,
        sort: 'recommended',
      });

      expect(kq.items).toHaveLength(3);
      expect(kq.items[0].userProgress).toEqual({
        status: 'IN_PROGRESS',
        answeredCount: 2,
        correctCount: null,
        totalQuestions: 4,
        durationSeconds: 95,
      });
      expect(kq.items[1].userProgress).toEqual({
        status: 'COMPLETED',
        answeredCount: 5,
        correctCount: 5,
        totalQuestions: 5,
        durationSeconds: 180,
      });
      expect(kq.items[2].userProgress).toEqual({
        status: 'NOT_STARTED',
        answeredCount: 0,
        correctCount: null,
        totalQuestions: 6,
        durationSeconds: null,
      });
      expect(kq.topics).toEqual(['Cuộc sống', 'Du lịch', 'Giáo dục']);
      expect(kq.meta).toEqual({ page: 1, limit: 5, total: 3, totalPages: 1 });
    });

    it('áp dụng bộ lọc cefr, topic, search và status vào điều kiện truy vấn', async () => {
      prismaMock.readingPassage.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prismaMock.readingPassage.count.mockResolvedValue(0);

      await service.listReadings(USER_ID, {
        page: 1,
        limit: 5,
        cefr: 'B1',
        topic: 'Giáo dục',
        search: 'Cognitive',
        status: 'COMPLETED',
        sort: 'level_asc',
      });

      expect(prismaMock.readingPassage.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            cefr: 'B1',
            topic: { equals: 'Giáo dục', mode: 'insensitive' },
            attempts: {
              some: { userId: USER_ID, status: ReadingAttemptStatus.COMPLETED },
              none: { userId: USER_ID, status: ReadingAttemptStatus.IN_PROGRESS },
            },
          }),
        }),
      );
    });
  });

  describe('getReadingById', () => {
    it('trả về chi tiết bài đọc, danh sách câu hỏi không chứa đáp án và bản nháp đang làm dở', async () => {
      prismaMock.readingPassage.findFirst.mockResolvedValue({
        id: PASSAGE_ID,
        slug: 'the-path-to-cognitive-mastery',
        title: 'The Path to Cognitive Mastery',
        summary: 'Khám phá cách ghi nhớ chủ động.',
        content: 'In any serious academic pursuit...',
        topic: 'Giáo dục',
        cefr: CefrLevel.B1,
        estimatedMinutes: 15,
        questions: [
          {
            id: 'q-1',
            orderIndex: 1,
            questionText: 'What is the primary topic of the passage?',
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
          },
        ],
        attempts: [
          {
            id: 'att-1',
            durationSeconds: 120,
            answers: [{ questionId: 'q-1', selectedOptionIndex: 1 }],
          },
        ],
      });

      const kq = await service.getReadingById(USER_ID, PASSAGE_ID);

      expect(kq.id).toBe(PASSAGE_ID);
      expect(kq.questions[0]).toEqual({
        id: 'q-1',
        orderIndex: 1,
        questionText: 'What is the primary topic of the passage?',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
      });
      expect(kq.draftAttempt).toEqual({
        id: 'att-1',
        durationSeconds: 120,
        answers: [{ questionId: 'q-1', selectedOptionIndex: 1 }],
      });
    });

    it('ném lỗi 404 NotFoundException khi không tìm thấy bài đọc', async () => {
      prismaMock.readingPassage.findFirst.mockResolvedValue(null);

      await expect(service.getReadingById(USER_ID, 'khong-ton-tai')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
  describe('saveDraft (WSEA-194)', () => {
    it('tạo mới bản nháp IN_PROGRESS và lọc bỏ câu trả lời không hợp lệ', async () => {
      prismaMock.readingPassage.findFirst.mockResolvedValue({
        id: PASSAGE_ID,
        questions: [
          { id: 'q-1', options: ['A', 'B', 'C', 'D'] },
          { id: 'q-2', options: ['True', 'False'] },
        ],
      });
      prismaMock.readingAttempt.findFirst.mockResolvedValue(null);
      prismaMock.readingAttempt.create.mockResolvedValue({
        id: 'draft-1',
        status: ReadingAttemptStatus.IN_PROGRESS,
        answeredCount: 1,
        totalQuestions: 2,
        durationSeconds: 45,
      });

      const kq = await service.saveDraft(USER_ID, PASSAGE_ID, {
        durationSeconds: 45,
        answers: [
          { questionId: 'q-1', selectedOptionIndex: 2 },
          { questionId: 'q-2', selectedOptionIndex: 5 },
          { questionId: 'q-khong-ton-tai', selectedOptionIndex: 0 },
        ],
      });

      expect(prismaMock.readingAttempt.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          passageId: PASSAGE_ID,
          status: ReadingAttemptStatus.IN_PROGRESS,
          answers: [{ questionId: 'q-1', selectedOptionIndex: 2 }],
          answeredCount: 1,
          totalQuestions: 2,
          durationSeconds: 45,
        },
      });
      expect(kq.answeredCount).toBe(1);
    });
  });

  describe('submitReading (WSEA-194)', () => {
    const mockPassageWithQuestions = {
      id: PASSAGE_ID,
      questions: [
        {
          id: 'q-1',
          orderIndex: 1,
          questionText: 'Câu 1?',
          options: ['A', 'B', 'C', 'D'],
          correctOptionIndex: 1,
          explanation: 'Giải thích câu 1',
        },
        {
          id: 'q-2',
          orderIndex: 2,
          questionText: 'Câu 2?',
          options: ['True', 'False'],
          correctOptionIndex: 0,
          explanation: 'Giải thích câu 2',
        },
      ],
    };

    it('chấm điểm đúng/sai, xóa bản nháp cũ và trả về giải thích chi tiết', async () => {
      prismaMock.readingPassage.findFirst.mockResolvedValue(mockPassageWithQuestions);
      prismaMock.readingAttempt.deleteMany.mockResolvedValue({ count: 1 });
      prismaMock.readingAttempt.create.mockResolvedValue({ id: 'att-completed-1' });

      const kq = await service.submitReading(USER_ID, PASSAGE_ID, {
        durationSeconds: 210,
        answers: [
          { questionId: 'q-1', selectedOptionIndex: 1 },
          { questionId: 'q-2', selectedOptionIndex: 1 },
        ],
      });

      expect(kq.correctCount).toBe(1);
      expect(kq.wrongCount).toBe(1);
      expect(kq.totalQuestions).toBe(2);
      expect(kq.results).toEqual([
        expect.objectContaining({
          questionId: 'q-1',
          selectedOptionIndex: 1,
          correctOptionIndex: 1,
          isCorrect: true,
          explanation: 'Giải thích câu 1',
        }),
        expect.objectContaining({
          questionId: 'q-2',
          selectedOptionIndex: 1,
          correctOptionIndex: 0,
          isCorrect: false,
          explanation: 'Giải thích câu 2',
        }),
      ]);
      expect(prismaMock.readingAttempt.deleteMany).toHaveBeenCalledOnce();
      expect(prismaMock.readingAttempt.create).toHaveBeenCalledOnce();
    });

    it('ném 400 BadRequestException khi chưa trả lời đủ tất cả câu hỏi', async () => {
      prismaMock.readingPassage.findFirst.mockResolvedValue(mockPassageWithQuestions);

      await expect(
        service.submitReading(USER_ID, PASSAGE_ID, {
          durationSeconds: 60,
          answers: [{ questionId: 'q-1', selectedOptionIndex: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listHistory (WSEA-194)', () => {
    it('trả về lịch sử các lượt làm bài đã hoàn thành của người học', async () => {
      const now = new Date();
      prismaMock.readingAttempt.findMany.mockResolvedValue([
        {
          id: 'att-1',
          passageId: PASSAGE_ID,
          correctCount: 3,
          totalQuestions: 4,
          durationSeconds: 300,
          submittedAt: now,
          answers: [],
          passage: {
            id: PASSAGE_ID,
            slug: 'the-path-to-cognitive-mastery',
            title: 'The Path to Cognitive Mastery',
            topic: 'Giáo dục',
            cefr: CefrLevel.B1,
          },
        },
      ]);

      const kq = await service.listHistory(USER_ID);

      expect(kq).toHaveLength(1);
      expect(kq[0]).toMatchObject({
        attemptId: 'att-1',
        correctCount: 3,
        wrongCount: 1,
        totalQuestions: 4,
        durationSeconds: 300,
      });
    });
  });
});
