import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { VisionAiClient } from './vision-ai.client';
import { DUNG_LUONG_ANH_TOI_DA, VisionService } from './vision.service';
import { TepAnhTaiLen } from './vision.types';

const USER_ID = 'user-1';

/** Tạo buffer có chữ ký byte đầu chuẩn của ảnh JPEG (FF D8 FF) */
function taoAnhJpegGia(noiDung = 'anh-mau-1', kichThuoc?: number): TepAnhTaiLen {
  const header = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
  const body = Buffer.from(noiDung, 'utf8');
  const buffer = Buffer.concat([header, body]);
  return {
    buffer,
    mimetype: 'image/jpeg',
    size: kichThuoc ?? buffer.length,
    originalname: 'test.jpg',
  };
}

describe('VisionService (WSEA-155)', () => {
  let service: VisionService;

  const prismaMock = {
    user: { findUnique: vi.fn() },
    word: { findMany: vi.fn() },
    userCard: { findMany: vi.fn() },
  };

  const aiClientMock = {
    nhanDienAnh: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ level: 'A1' });
    prismaMock.userCard.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: VisionAiClient, useValue: aiClientMock },
      ],
    }).compile();

    service = module.get<VisionService>(VisionService);
  });

  describe('kiểm tra định dạng và dung lượng tệp ảnh', () => {
    it('từ chối khi không gửi tệp ảnh hoặc tệp rỗng', async () => {
      await expect(service.detectFromImage(USER_ID, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('từ chối mã 413 khi dung lượng ảnh vượt quá 5 MB', async () => {
      const anhQuaLon = taoAnhJpegGia('lon', DUNG_LUONG_ANH_TOI_DA + 1);
      await expect(service.detectFromImage(USER_ID, anhQuaLon)).rejects.toThrow(
        PayloadTooLargeException,
      );
    });

    it('từ chối khi định dạng MIME hoặc chữ ký byte không phải JPEG/PNG/WebP', async () => {
      const tepGiaMao: TepAnhTaiLen = {
        buffer: Buffer.from('not-an-image-file-content'),
        mimetype: 'image/jpeg',
        size: 25,
      };
      await expect(service.detectFromImage(USER_ID, tepGiaMao)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('bộ nhớ đệm theo mã băm ảnh SHA-256', () => {
    it('trúng bộ nhớ đệm ở lần gửi thứ hai của cùng một bức ảnh, không gọi lại dịch vụ AI', async () => {
      aiClientMock.nhanDienAnh.mockResolvedValue({
        items: [{ word: 'keyboard', score: 0.35 }],
        lowConfidence: false,
        tau: 0.24,
        latencyMs: 320,
      });
      prismaMock.word.findMany.mockResolvedValue([
        {
          id: 'w-keyboard',
          term: 'keyboard',
          ipa: '/ˈkiː.bɔːd/',
          pos: 'NOUN',
          meaningVi: 'bàn phím',
          exampleEn: 'Use the keyboard.',
          cefr: 'A2',
          topic: null,
        },
      ]);

      const anh = taoAnhJpegGia('cung-mot-anh');
      const lan1 = await service.detectFromImage(USER_ID, anh);
      const lan2 = await service.detectFromImage(USER_ID, anh);

      expect(lan1.cached).toBe(false);
      expect(lan2.cached).toBe(true);
      expect(aiClientMock.nhanDienAnh).toHaveBeenCalledTimes(1);
      expect(lan2.items).toHaveLength(1);
      expect(lan2.items[0].term).toBe('keyboard');
    });
  });

  describe('kết nối bảng từ vựng, lọc CEFR và cắt top-5', () => {
    it('JOIN bảng words, đánh dấu inDeck, lọc theo CEFR của người học và cắt tối đa 5 từ', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ level: 'A1' });
      aiClientMock.nhanDienAnh.mockResolvedValue({
        items: [
          { word: 'apple', score: 0.45 },
          { word: 'book', score: 0.42 },
          { word: 'chair', score: 0.39 },
          { word: 'table', score: 0.36 },
          { word: 'window', score: 0.33 },
          { word: 'door', score: 0.31 },
          { word: 'microscope', score: 0.49 },
        ],
        lowConfidence: false,
        tau: 0.24,
        latencyMs: 410,
      });

      prismaMock.word.findMany.mockResolvedValue([
        {
          id: 'w1',
          term: 'apple',
          ipa: null,
          pos: 'NOUN',
          meaningVi: 'quả táo',
          exampleEn: null,
          cefr: 'A1',
          topic: null,
        },
        {
          id: 'w2',
          term: 'book',
          ipa: null,
          pos: 'NOUN',
          meaningVi: 'quyển sách',
          exampleEn: null,
          cefr: 'A1',
          topic: null,
        },
        {
          id: 'w3',
          term: 'chair',
          ipa: null,
          pos: 'NOUN',
          meaningVi: 'cái ghế',
          exampleEn: null,
          cefr: 'A1',
          topic: null,
        },
        {
          id: 'w4',
          term: 'table',
          ipa: null,
          pos: 'NOUN',
          meaningVi: 'cái bàn',
          exampleEn: null,
          cefr: 'A1',
          topic: null,
        },
        {
          id: 'w5',
          term: 'window',
          ipa: null,
          pos: 'NOUN',
          meaningVi: 'cửa sổ',
          exampleEn: null,
          cefr: 'A2',
          topic: null,
        },
        {
          id: 'w6',
          term: 'door',
          ipa: null,
          pos: 'NOUN',
          meaningVi: 'cánh cửa',
          exampleEn: null,
          cefr: 'A1',
          topic: null,
        },
        {
          id: 'w7',
          term: 'microscope',
          ipa: null,
          pos: 'NOUN',
          meaningVi: 'kính hiển vi',
          exampleEn: null,
          cefr: 'B2',
          topic: null,
        },
      ]);
      prismaMock.userCard.findMany.mockResolvedValue([{ wordId: 'w2' }]);

      const kq = await service.detectFromImage(USER_ID, taoAnhJpegGia('anh-nhieu-tu'));

      expect(kq.degraded).toBe(false);
      expect(kq.items).toHaveLength(5);
      expect(kq.items.map((i) => i.term)).toEqual(['apple', 'book', 'chair', 'table', 'window']);
      expect(kq.items.find((i) => i.term === 'book')?.inDeck).toBe(true);
      expect(kq.items.find((i) => i.term === 'apple')?.inDeck).toBe(false);
    });

    it('bật cờ degraded = true khi dịch vụ AI không phản hồi để giao diện cho nhập từ tay', async () => {
      aiClientMock.nhanDienAnh.mockResolvedValue(null);

      const kq = await service.detectFromImage(USER_ID, taoAnhJpegGia('anh-khi-ai-sap'));

      expect(kq.degraded).toBe(true);
      expect(kq.items).toEqual([]);
      expect(kq.message).toContain('nhập từ');
    });
  });
});
