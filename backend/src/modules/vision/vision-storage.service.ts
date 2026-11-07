import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { TepAnhTaiLen } from './vision.types';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Giữ tối đa 100 ảnh gần nhất trong bộ nhớ đệm phòng trường hợp ổ đĩa tạm trên đám mây bị xoá */
const RAM_CACHE_MAX = 100;

@Injectable()
export class VisionStorageService {
  private readonly logger = new Logger(VisionStorageService.name);
  private readonly uploadDir: string;
  private readonly boNhoAnh = new Map<string, { buffer: Buffer; mimetype: string }>();

  constructor(private readonly config: ConfigService) {
    this.uploadDir =
      this.config.get<string>('VISION_UPLOAD_DIR') ?? path.join(process.cwd(), 'uploads', 'vision');
  }

  /**
   * Lưu tệp ảnh theo mã băm SHA-256 và trả về đường dẫn truy cập ảnh (imageUrl).
   * Ưu tiên đẩy lên Supabase Storage nếu đã cấu hình, ngược lại lưu cục bộ và phục vụ qua /api/vision/images/:fileName.
   */
  async luuAnh(imageHash: string, file: TepAnhTaiLen): Promise<string> {
    const ext = MIME_TO_EXT[file.mimetype.toLowerCase()] ?? 'jpg';
    const fileName = `${imageHash}.${ext}`;

    // 1. Lưu vào bộ nhớ đệm RAM để đọc nhanh và dự phòng
    if (this.boNhoAnh.size >= RAM_CACHE_MAX && !this.boNhoAnh.has(fileName)) {
      const [cuNhat] = this.boNhoAnh.keys();
      if (cuNhat) this.boNhoAnh.delete(cuNhat);
    }
    this.boNhoAnh.set(fileName, {
      buffer: file.buffer,
      mimetype: EXT_TO_MIME[ext] ?? 'image/jpeg',
    });

    // 2. Nếu có cấu hình Supabase Storage thì tải lên đám mây
    const cloudUrl = await this.thuTaiLenSupabase(fileName, file.buffer, file.mimetype);
    if (cloudUrl) return cloudUrl;

    // 3. Lưu xuống thư mục cục bộ uploads/vision
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      const filePath = path.join(this.uploadDir, fileName);
      await fs.writeFile(filePath, file.buffer);
    } catch (err) {
      this.logger.warn(`Không thể ghi tệp ảnh xuống đĩa, dùng bộ đệm RAM: ${String(err)}`);
    }

    const publicBase = this.config.get<string>('BACKEND_PUBLIC_URL')?.replace(/\/+$/, '');
    if (publicBase) {
      return `${publicBase}/api/vision/images/${fileName}`;
    }
    const port = this.config.get<number>('PORT') ?? 3001;
    return `http://localhost:${port}/api/vision/images/${fileName}`;
  }

  /** Đọc tệp ảnh đã lưu theo tên file (<sha256>.<ext>) để trả về cho trình duyệt */
  async docAnh(fileName: string): Promise<{ buffer: Buffer; mimetype: string } | null> {
    // Chỉ cho phép tên file dạng hex sha256 + đuôi ảnh hợp lệ để chống Path Traversal
    if (!/^[a-f0-9]{64}\.(jpg|jpeg|png|webp)$/i.test(fileName)) {
      return null;
    }

    const tuRam = this.boNhoAnh.get(fileName);
    if (tuRam) return tuRam;

    try {
      const filePath = path.join(this.uploadDir, fileName);
      const buffer = await fs.readFile(filePath);
      const ext = path.extname(fileName).slice(1).toLowerCase();
      const mimetype = EXT_TO_MIME[ext] ?? 'image/jpeg';
      return { buffer, mimetype };
    } catch {
      return null;
    }
  }

  private async thuTaiLenSupabase(
    fileName: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<string | null> {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL')?.replace(/\/+$/, '');
    const supabaseKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const bucket = this.config.get<string>('SUPABASE_STORAGE_BUCKET') ?? 'vision-images';

    if (!supabaseUrl || !supabaseKey) return null;

    try {
      const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${fileName}`;
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
          'Content-Type': mimetype || 'image/jpeg',
          'x-upsert': 'true',
        },
        body: new Uint8Array(buffer),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        return `${supabaseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
      }
      this.logger.warn(`Supabase Storage trả mã ${res.status}, chuyển sang lưu cục bộ`);
      return null;
    } catch (err) {
      this.logger.warn(`Lỗi tải ảnh lên Supabase Storage: ${String(err)}`);
      return null;
    }
  }
}
