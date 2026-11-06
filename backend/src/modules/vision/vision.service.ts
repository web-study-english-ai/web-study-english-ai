import {
  BadRequestException,
  Injectable,
  Optional,
  PayloadTooLargeException,
} from '@nestjs/common';
import { CefrLevel } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { VisionAiClient } from './vision-ai.client';
import { KetQuaNhanDienAnh, PhanHoiNhanDienAi, TepAnhTaiLen, TuVungNhanDien } from './vision.types';
import { VisionStorageService } from './vision-storage.service';

/** Giới hạn dung lượng tệp ảnh tối đa: 5 MB */
export const DUNG_LUONG_ANH_TOI_DA = 5 * 1024 * 1024;

/** Các định dạng MIME ảnh được phép tải lên */
const DINH_DANG_CHO_PHEP = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

/** Số từ tối đa trả về cho người học sau khi lọc (Hợp đồng v0.4: cắt còn 5) */
const SO_TU_TRA_VE_TOI_DA = 5;

/** Cấu hình bộ nhớ đệm kết quả nhận diện theo mã băm ảnh SHA-256 */
const CACHE_TOI_DA_PHAN_TU = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 giờ

const THU_TU_CEFR: Record<CefrLevel, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
};

interface BanGhiCacheAnh {
  phanHoiAi: PhanHoiNhanDienAi;
  hetHanLuc: number;
}

@Injectable()
export class VisionService {
  private readonly cacheAnh = new Map<string, BanGhiCacheAnh>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClient: VisionAiClient,
    @Optional() private readonly storage?: VisionStorageService,
  ) {}

  /**
   * Xử lý luồng nhận diện từ vựng từ ảnh (WSEA-155):
   * 1. Kiểm tra định dạng (JPEG/PNG/WebP) và dung lượng (<= 5 MB)
   * 2. Tính mã băm SHA-256 và tra bộ nhớ đệm
   * 3. Gọi dịch vụ AI (POST /recognize/image) nếu chưa có trong bộ nhớ đệm
   * 4. JOIN bảng words, lọc theo trình độ CEFR của người học và cắt lấy top-5
   */
  async detectFromImage(userId: string, file?: TepAnhTaiLen): Promise<KetQuaNhanDienAnh> {
    this.kiemTraTepAnh(file);

    const batDau = Date.now();
    const imageHash = this.tinhMaBamAnh(file.buffer);
    const imageUrl = (await this.storage?.luuAnh(imageHash, file)) ?? null;

    // Lấy trình độ CEFR hiện tại của người học (mặc định A1 nếu không tìm thấy)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { level: true },
    });
    const userCefr: CefrLevel = user?.level ?? CefrLevel.A1;

    // Kiểm tra bộ nhớ đệm theo mã băm ảnh
    let phanHoiAi = this.docTuCache(imageHash);
    let tuCache = true;

    if (!phanHoiAi) {
      tuCache = false;
      phanHoiAi = await this.aiClient.nhanDienAnh(file);
      if (phanHoiAi) {
        this.luuVaoCache(imageHash, phanHoiAi);
      }
    }

    // Khi dịch vụ AI lỗi hoặc không phản hồi -> trả về degraded = true để UI cho nhập từ tay
    if (!phanHoiAi) {
      return {
        items: [],
        results: [],
        imageHash,
        imageUrl,
        lowConfidence: false,
        tau: null,
        degraded: true,
        cached: false,
        latencyMs: Date.now() - batDau,
        message:
          'Chức năng nhận diện ảnh tạm thời không khả dụng. Bạn có thể tự nhập từ vựng bằng tay.',
      };
    }

    // Kết nối với bảng từ vựng (words), lọc theo CEFR và cắt còn tối đa 5 từ
    const danhSachTu = await this.ketNoiBangTuVungVaLocCefr(userId, phanHoiAi.items, userCefr);

    const lowConfidence = phanHoiAi.lowConfidence || danhSachTu.length === 0;

    return {
      items: danhSachTu,
      results: danhSachTu,
      imageHash,
      imageUrl,
      lowConfidence,
      tau: phanHoiAi.tau,
      degraded: false,
      cached: tuCache,
      latencyMs: tuCache ? Date.now() - batDau : phanHoiAi.latencyMs,
      ...(lowConfidence
        ? { message: 'Chưa chắc chắn kết quả nhận diện, bạn có thể chụp lại ảnh rõ hơn.' }
        : {}),
    };
  }

  async layTepAnhDaLuu(fileName: string) {
    return (await this.storage?.docAnh(fileName)) ?? null;
  }

  /** Bước 1: Kiểm tra sự tồn tại, dung lượng và định dạng thực tế của tệp ảnh */
  private kiemTraTepAnh(file?: TepAnhTaiLen): asserts file is TepAnhTaiLen {
    if (!file || !file.buffer || file.size === 0 || file.buffer.length === 0) {
      throw new BadRequestException('Vui lòng chọn tệp ảnh hợp lệ để nhận diện');
    }

    if (file.size > DUNG_LUONG_ANH_TOI_DA || file.buffer.length > DUNG_LUONG_ANH_TOI_DA) {
      throw new PayloadTooLargeException('Dung lượng ảnh vượt quá giới hạn tối đa 5 MB');
    }

    const mime = (file.mimetype || '').toLowerCase();
    if (!DINH_DANG_CHO_PHEP.has(mime) || !this.laMaByteAnhHopLe(file.buffer)) {
      throw new BadRequestException('Chỉ chấp nhận định dạng ảnh JPEG, PNG hoặc WebP');
    }
  }

  /** Kiểm tra chữ ký byte đầu (Magic Bytes) của JPEG, PNG, WebP */
  private laMaByteAnhHopLe(buf: Buffer): boolean {
    if (buf.length < 12) return false;
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return true;
    }
    // WebP: "RIFF"...."WEBP"
    if (
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return true;
    }
    return false;
  }

  /** Bước 2: Tính mã băm SHA-256 của tệp ảnh */
  tinhMaBamAnh(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private docTuCache(imageHash: string): PhanHoiNhanDienAi | null {
    const banGhi = this.cacheAnh.get(imageHash);
    if (!banGhi) return null;

    if (Date.now() > banGhi.hetHanLuc) {
      this.cacheAnh.delete(imageHash);
      return null;
    }

    // Đẩy lên cuối Map để giữ thứ tự LRU
    this.cacheAnh.delete(imageHash);
    this.cacheAnh.set(imageHash, banGhi);
    return banGhi.phanHoiAi;
  }

  private luuVaoCache(imageHash: string, phanHoiAi: PhanHoiNhanDienAi): void {
    if (this.cacheAnh.size >= CACHE_TOI_DA_PHAN_TU && !this.cacheAnh.has(imageHash)) {
      const [khoaCuNhat] = this.cacheAnh.keys();
      if (khoaCuNhat) {
        this.cacheAnh.delete(khoaCuNhat);
      }
    }
    this.cacheAnh.set(imageHash, {
      phanHoiAi,
      hetHanLuc: Date.now() + CACHE_TTL_MS,
    });
  }

  /**
   * Bước 4: JOIN kết quả từ AI với bảng words, kiểm tra thẻ đã có trong bộ thẻ (inDeck),
   * lọc theo trình độ CEFR của người học và cắt lấy tối đa 5 từ.
   */
  private async ketNoiBangTuVungVaLocCefr(
    userId: string,
    nhanAi: { word: string; score: number }[],
    userCefr: CefrLevel,
  ): Promise<TuVungNhanDien[]> {
    if (nhanAi.length === 0) return [];

    // Giữ điểm số cao nhất cho mỗi từ nếu AI trả trùng
    const diemTheoTu = new Map<string, number>();
    for (const item of nhanAi) {
      const term = item.word.trim().toLowerCase();
      if (!term) continue;
      const diemCu = diemTheoTu.get(term);
      if (diemCu === undefined || item.score > diemCu) {
        diemTheoTu.set(term, item.score);
      }
    }

    const danhSachTerm = Array.from(diemTheoTu.keys());
    if (danhSachTerm.length === 0) return [];

    const words = await this.prisma.word.findMany({
      where: { term: { in: danhSachTerm } },
      select: {
        id: true,
        term: true,
        ipa: true,
        pos: true,
        meaningVi: true,
        exampleEn: true,
        cefr: true,
        topic: {
          select: { id: true, slug: true, name: true },
        },
      },
    });

    if (words.length === 0) return [];

    // Kiểm tra những từ nào đã nằm trong bộ thẻ của người học
    const theHienCo = await this.prisma.userCard.findMany({
      where: {
        userId,
        wordId: { in: words.map((w) => w.id) },
      },
      select: { wordId: true },
    });
    const tapWordIdTrongDeck = new Set(theHienCo.map((c) => c.wordId));

    const ketQuaKhop: TuVungNhanDien[] = words.map((w) => ({
      wordId: w.id,
      term: w.term,
      ipa: w.ipa,
      pos: w.pos,
      meaningVi: w.meaningVi,
      exampleEn: w.exampleEn,
      cefr: w.cefr,
      topic: w.topic,
      score: diemTheoTu.get(w.term.toLowerCase()) ?? 0,
      inDeck: tapWordIdTrongDeck.has(w.id),
    }));

    // Sắp xếp theo điểm số AI giảm dần
    ketQuaKhop.sort((a, b) => b.score - a.score);

    // Lọc ưu tiên các từ có bậc CEFR phù hợp với trình độ người học (<= bậc hiện tại + 1 bậc)
    const bacNguoiHoc = THU_TU_CEFR[userCefr] ?? 1;
    const phuHopCefr = ketQuaKhop.filter(
      (item) => (THU_TU_CEFR[item.cefr] ?? 1) <= bacNguoiHoc + 1,
    );

    // Nếu sau khi lọc theo CEFR mà vẫn có kết quả thì lấy trong nhóm phù hợp;
    // nếu rỗng (ví dụ người học A1 nhưng chụp vật thể chỉ có từ B2) thì giữ kết quả gốc để không mất từ
    const danhSachCuoi = phuHopCefr.length > 0 ? phuHopCefr : ketQuaKhop;

    return danhSachCuoi.slice(0, SO_TU_TRA_VE_TOI_DA);
  }
}
