import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { DictionaryService } from './dictionary.service';

const prismaMock = {
  dictionaryEntry: { findUnique: vi.fn(), upsert: vi.fn() },
};

const configMock = {
  get: vi.fn((key: string) => {
    const values: Record<string, string> = {
      DICTIONARY_API_URL: 'https://www.dictionaryapi.com/api/v3/references/learners/json',
      DICTIONARY_API_KEY: 'test-key',
      DICTIONARY_TIMEOUT_MS: '3000',
      DICTIONARY_NEGATIVE_CACHE_DAYS: '7',
    };
    return values[key];
  }),
};

const apiResponse = [
  {
    meta: { id: 'book' },
    fl: 'noun',
    shortdef: ['a set of printed sheets of paper bound together'],
    hwi: {
      hw: 'book',
      prs: [{ mw: 'ˈbu̇k', sound: { audio: 'book0001' } }],
    },
  },
];

describe('DictionaryService', () => {
  let service: DictionaryService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    // Chặn log của Nest để terminal khi chạy test không bị lẫn WARN/ERROR giả lập
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DictionaryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<DictionaryService>(DictionaryService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('dùng cache và KHÔNG gọi mạng khi đã có dữ liệu', async () => {
    prismaMock.dictionaryEntry.findUnique.mockResolvedValue({
      term: 'book',
      phoneticText: '/bʊk/',
      audioUrl: 'https://media/book-us.mp3',
      definitions: [],
      status: 'FOUND',
      fetchedAt: new Date(),
    });

    const result = await service.lookup('Book');

    expect(fetch).not.toHaveBeenCalled();
    expect(result.source).toBe('cache');
    expect(result.term).toBe('book');
  });

  it('dựng đúng URL audio từ tên file của Merriam-Webster', async () => {
    prismaMock.dictionaryEntry.findUnique.mockResolvedValue(null);
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(apiResponse)),
    });
    prismaMock.dictionaryEntry.upsert.mockImplementation(({ create }: any) => ({
      ...create,
      status: 'FOUND',
    }));

    const result = await service.lookup('book');

    expect(result.audioUrl).toBe(
      'https://media.merriam-webster.com/audio/prons/en/us/mp3/b/book0001.mp3',
    );
    expect(result.available).toBe(true);
  });

  it('ghi cache NOT_FOUND khi API trả mảng gợi ý thay vì kết quả', async () => {
    prismaMock.dictionaryEntry.findUnique.mockResolvedValue(null);
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(['buzz', 'bizz'])),
    });
    prismaMock.dictionaryEntry.upsert.mockImplementation(({ create }: any) => create);

    const result = await service.lookup('zzzzqq');

    expect(prismaMock.dictionaryEntry.upsert).toHaveBeenCalled();
    expect(result.available).toBe(false);
  });

  it('trả fallback IPA và KHÔNG ghi cache khi dịch vụ lỗi', async () => {
    prismaMock.dictionaryEntry.findUnique.mockResolvedValue(null);
    (fetch as any).mockRejectedValue(new Error('timeout'));

    const result = await service.lookup('book', '/bˈʊk/');

    expect(result.source).toBe('fallback');
    expect(result.phoneticText).toBe('/bˈʊk/');
    expect(result.audioUrl).toBeNull();
    expect(prismaMock.dictionaryEntry.upsert).not.toHaveBeenCalled();
  });

  it('trả fallback và ghi log khi API báo key không hợp lệ', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    prismaMock.dictionaryEntry.findUnique.mockResolvedValue(null);
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('Invalid API key. Not for print or non-JavaScript use.'),
    });

    const result = await service.lookup('book', '/bˈʊk/');

    expect(result.source).toBe('fallback');
    expect(result.phoneticText).toBe('/bˈʊk/');
    expect(errorSpy).toHaveBeenCalled();
    expect(prismaMock.dictionaryEntry.upsert).not.toHaveBeenCalled();
  });

  it('gọi lại API khi cache NOT_FOUND đã quá 7 ngày', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    prismaMock.dictionaryEntry.findUnique.mockResolvedValue({
      term: 'book',
      phoneticText: null,
      audioUrl: null,
      definitions: null,
      status: 'NOT_FOUND',
      fetchedAt: eightDaysAgo,
    });
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(apiResponse),
    });
    prismaMock.dictionaryEntry.upsert.mockImplementation(({ create }: any) => ({
      ...create,
      status: 'FOUND',
    }));

    await service.lookup('book');

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
