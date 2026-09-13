import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { VocabularyService } from './vocabulary.service';
import { ListWordsDto } from './dto/list-words.dto';
import { DictionaryService } from '@modules/dictionary/dictionary.service';

const dictionaryMock = {
  lookup: vi.fn().mockResolvedValue({
    term: 'book',
    phoneticText: '/bʊk/',
    audioUrl: null,
    definitions: [],
    source: 'fallback',
    available: false,
  }),
};
const prismaMock = {
  word: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  topic: { findMany: vi.fn() },
  $transaction: vi.fn(),
};

const baseQuery = { page: 1, limit: 20, sort: 'rank' } as ListWordsDto;

describe('VocabularyService', () => {
  let service: VocabularyService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VocabularyService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: DictionaryService, useValue: dictionaryMock },
      ],
    }).compile();

    service = module.get<VocabularyService>(VocabularyService);
  });

  describe('listWords', () => {
    it('trả về đúng thông tin phân trang', async () => {
      prismaMock.$transaction.mockResolvedValue([[{ id: 'w1', term: 'book' }], 45]);

      const result = await service.listWords({ ...baseQuery, page: 2, limit: 20 });

      expect(result.meta).toEqual({ page: 2, limit: 20, total: 45, totalPages: 3 });
      expect(result.items).toHaveLength(1);
    });

    it('bỏ qua bộ lọc khi không truyền tham số', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      await service.listWords(baseQuery);

      const args = prismaMock.word.findMany.mock.calls[0][0];
      expect(args.where).toEqual({});
      expect(args.skip).toBe(0);
      expect(args.take).toBe(20);
    });

    it('tìm kiếm theo cả từ và nghĩa, không phân biệt hoa thường', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      await service.listWords({ ...baseQuery, search: 'Book' });

      const where = prismaMock.word.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { term: { contains: 'Book', mode: 'insensitive' } },
        { meaningVi: { contains: 'Book', mode: 'insensitive' } },
      ]);
    });

    it('lọc đồng thời theo trình độ và chủ đề', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      await service.listWords({
        ...baseQuery,
        cefr: 'A1',
        topicId: '11111111-1111-1111-1111-111111111111',
      });

      const where = prismaMock.word.findMany.mock.calls[0][0].where;
      expect(where.cefr).toBe('A1');
      expect(where.topicId).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('trả totalPages = 1 khi không có kết quả', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      const result = await service.listWords(baseQuery);

      expect(result.meta.totalPages).toBe(1);
    });

    it('sắp xếp theo term khi sort = term', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      await service.listWords({ ...baseQuery, sort: 'term' });

      expect(prismaMock.word.findMany.mock.calls[0][0].orderBy).toEqual({ term: 'asc' });
    });
  });

  describe('getWordById', () => {
    it('ném NotFoundException khi từ không tồn tại', async () => {
      prismaMock.word.findUnique.mockResolvedValue(null);

      await expect(service.getWordById('khong-ton-tai')).rejects.toThrow(NotFoundException);
    });

    it('trả về từ kèm dữ liệu phát âm khi tìm thấy', async () => {
      prismaMock.word.findUnique.mockResolvedValue({ id: 'w1', term: 'book', ipa: '/bʊk/' });

      const result = await service.getWordById('w1');

      expect(result.term).toBe('book');
      expect(result.pronunciation.phoneticText).toBe('/bʊk/');
      expect(dictionaryMock.lookup).toHaveBeenCalledWith('book', '/bʊk/');
    });
  });
});
