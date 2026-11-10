import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type { Buffer } from 'node:buffer';
import { AuthProvider, CefrLevel, PartOfSpeech, Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@/prisma/prisma.service';
import {
  AdminImportWordsDto,
  AdminListReadingDto,
  AdminListUsersDto,
  AdminListWordsDto,
  AdminUpdateReadingDto,
  AdminUpdateUserDto,
  AdminUpdateWordDto,
} from './dto/admin.dto';

const posMap: Record<string, PartOfSpeech> = {
  n: PartOfSpeech.NOUN,
  noun: PartOfSpeech.NOUN,
  v: PartOfSpeech.VERB,
  verb: PartOfSpeech.VERB,
  adj: PartOfSpeech.ADJECTIVE,
  adjective: PartOfSpeech.ADJECTIVE,
  adv: PartOfSpeech.ADVERB,
  adverb: PartOfSpeech.ADVERB,
  prep: PartOfSpeech.PREPOSITION,
  preposition: PartOfSpeech.PREPOSITION,
  pron: PartOfSpeech.PRONOUN,
  pronoun: PartOfSpeech.PRONOUN,
  conj: PartOfSpeech.CONJUNCTION,
  conjunction: PartOfSpeech.CONJUNCTION,
  interj: PartOfSpeech.INTERJECTION,
  interjection: PartOfSpeech.INTERJECTION,
  num: PartOfSpeech.NUMERAL,
  numeral: PartOfSpeech.NUMERAL,
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export interface PreviewRowItem {
  rowNumber: number;
  term: string;
  pos: string;
  meaningVi: string;
  cefr: string;
  topic: string;
  ipa: string | null;
  exampleEn: string | null;
  isValid: boolean;
  errorMessage: string;
}

@Injectable()
export class AdminService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      const adminEmail = 'admin@gmail.com';
      const passwordHash = await bcrypt.hash('Admin@123', 10);

      await this.prisma.user.upsert({
        where: { email: adminEmail },
        update: {
          fullName: 'Admin',
          passwordHash,
          role: UserRole.ADMIN,
          isActive: true,
        },
        create: {
          email: adminEmail,
          passwordHash,
          fullName: 'Admin',
          role: UserRole.ADMIN,
          provider: AuthProvider.LOCAL,
          isActive: true,
        },
      });
    } catch {
      // Bỏ qua nếu DB chưa sẵn sàng
    }
  }

  // ==================== 1. QUẢN LÝ TỪ VỰNG ====================
  async listWords(query: AdminListWordsDto) {
    const { page, limit, search, topicId, cefr } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.WordWhereInput = {
      ...(cefr ? { cefr } : {}),
      ...(topicId ? { topicId } : {}),
      ...(search
        ? {
            OR: [
              { term: { contains: search, mode: 'insensitive' } },
              { meaningVi: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.word.findMany({
        where,
        select: {
          id: true,
          term: true,
          pos: true,
          ipa: true,
          meaningVi: true,
          exampleEn: true,
          cefr: true,
          rank: true,
          topic: { select: { id: true, slug: true, name: true } },
        },
        orderBy: { rank: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.word.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async updateWord(id: string, dto: AdminUpdateWordDto) {
    const existing = await this.prisma.word.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy từ vựng');
    }

    if (dto.term && dto.term.toLowerCase() !== existing.term) {
      const dup = await this.prisma.word.findUnique({
        where: { term: dto.term.toLowerCase() },
      });
      if (dup) {
        throw new ConflictException('Từ vựng này đã tồn tại trong hệ thống');
      }
    }

    return this.prisma.word.update({
      where: { id },
      data: {
        ...(dto.term !== undefined ? { term: dto.term.toLowerCase() } : {}),
        ...(dto.pos !== undefined ? { pos: dto.pos } : {}),
        ...(dto.cefr !== undefined ? { cefr: dto.cefr } : {}),
        ...(dto.ipa !== undefined ? { ipa: dto.ipa } : {}),
        ...(dto.meaningVi !== undefined ? { meaningVi: dto.meaningVi } : {}),
        ...(dto.exampleEn !== undefined ? { exampleEn: dto.exampleEn } : {}),
        ...(dto.topicId !== undefined ? { topicId: dto.topicId } : {}),
      },
      select: {
        id: true,
        term: true,
        pos: true,
        ipa: true,
        meaningVi: true,
        exampleEn: true,
        cefr: true,
        rank: true,
        topic: { select: { id: true, slug: true, name: true } },
      },
    });
  }

  async deleteWord(id: string) {
    const existing = await this.prisma.word.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy từ vựng');
    }

    await this.prisma.word.delete({ where: { id } });
    return { message: 'Đã xóa từ vựng thành công' };
  }

  // Parse & Preview file CSV nạp từ vựng
  previewWordsFile(buffer: Buffer) {
    const content = buffer.toString('utf-8').replace(/^\uFEFF/, '');
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lines.length <= 1) {
      throw new BadRequestException('File CSV không có dữ liệu');
    }

    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    const termIdx = header.findIndex((h) => h === 'term' || h === 'word' || h === 'từ vựng');
    const posIdx = header.findIndex((h) => h === 'pos' || h === 'từ loại');
    const meaningIdx = header.findIndex(
      (h) => h === 'meaning_vi' || h === 'meaningvi' || h === 'nghĩa tiếng việt' || h === 'nghĩa',
    );
    const cefrIdx = header.findIndex((h) => h === 'cefr' || h === 'trình độ');
    const topicIdx = header.findIndex((h) => h === 'topic' || h === 'chủ đề');
    const ipaIdx = header.findIndex((h) => h === 'ipa' || h === 'phiên âm');
    const exampleIdx = header.findIndex(
      (h) => h === 'example_en' || h === 'exampleen' || h === 'ví dụ',
    );

    if (termIdx === -1 || posIdx === -1 || meaningIdx === -1) {
      throw new BadRequestException(
        'File CSV thiếu các cột bắt buộc: term (hoặc word), pos (hoặc từ loại), meaning_vi (hoặc nghĩa)',
      );
    }

    const rows: PreviewRowItem[] = [];
    let validCount = 0;
    let errorCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length === 0 || (cols.length === 1 && !cols[0])) continue;

      const term = (cols[termIdx] ?? '').trim().toLowerCase();
      const rawPos = (cols[posIdx] ?? '').trim().toLowerCase();
      const meaningVi = (cols[meaningIdx] ?? '').trim();
      const rawCefr = (cols[cefrIdx] ?? 'A1').trim().toUpperCase();
      const topic = (cols[topicIdx] ?? 'Tổng hợp').trim();
      const ipa = ipaIdx !== -1 && cols[ipaIdx] ? cols[ipaIdx].trim() : null;
      const exampleEn = exampleIdx !== -1 && cols[exampleIdx] ? cols[exampleIdx].trim() : null;

      const pos = posMap[rawPos];
      const validCefr = ['A1', 'A2', 'B1', 'B2'].includes(rawCefr) ? (rawCefr as CefrLevel) : null;

      const errors: string[] = [];
      if (!term) errors.push('Thiếu từ vựng');
      if (!pos) errors.push('Từ loại không hợp lệ (hỗ trợ n, v, adj, adv...)');
      if (!meaningVi) errors.push('Thiếu nghĩa tiếng Việt');
      if (!validCefr) errors.push('Trình độ phải là A1, A2, B1 hoặc B2');

      const isValid = errors.length === 0;
      if (isValid) validCount++;
      else errorCount++;

      rows.push({
        rowNumber: i,
        term,
        pos: pos ?? rawPos,
        meaningVi,
        cefr: validCefr ?? rawCefr,
        topic: topic || 'Tổng hợp',
        ipa,
        exampleEn,
        isValid,
        errorMessage: errors.join(', '),
      });
    }

    return {
      total: rows.length,
      validCount,
      errorCount,
      rows,
    };
  }

  // Import danh sách từ vựng hợp lệ vào DB
  async importWords(dto: AdminImportWordsDto) {
    const { words } = dto;

    const maxRankWord = await this.prisma.word.findFirst({
      orderBy: { rank: 'desc' },
      select: { rank: true },
    });
    let currentRank = (maxRankWord?.rank ?? 0) + 1;

    const uniqueTopics = Array.from(new Set(words.map((w) => w.topic)));
    const topicMap = new Map<string, string>();

    for (const topicName of uniqueTopics) {
      const slug = topicName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

      const t = await this.prisma.topic.upsert({
        where: { slug: slug || 'tong-hop' },
        update: { name: topicName },
        create: {
          slug: slug || 'tong-hop',
          name: topicName,
        },
      });
      topicMap.set(topicName, t.id);
    }

    let inserted = 0;
    let updated = 0;

    for (const w of words) {
      const topicId = topicMap.get(w.topic) ?? null;
      const existing = await this.prisma.word.findUnique({ where: { term: w.term.toLowerCase() } });

      if (existing) {
        await this.prisma.word.update({
          where: { id: existing.id },
          data: {
            pos: w.pos,
            cefr: w.cefr,
            ipa: w.ipa ?? existing.ipa,
            meaningVi: w.meaningVi,
            exampleEn: w.exampleEn ?? existing.exampleEn,
            topicId: topicId ?? existing.topicId,
          },
        });
        updated++;
      } else {
        await this.prisma.word.create({
          data: {
            term: w.term.toLowerCase(),
            rank: currentRank++,
            pos: w.pos,
            cefr: w.cefr,
            ipa: w.ipa ?? null,
            meaningVi: w.meaningVi,
            exampleEn: w.exampleEn ?? null,
            topicId,
          },
        });
        inserted++;
      }
    }

    return {
      message: `Nạp thành công ${words.length} từ vựng.`,
      inserted,
      updated,
    };
  }

  // ==================== 2. QUẢN LÝ TÀI KHOẢN ====================
  async listUsers(query: AdminListUsersDto) {
    const { page, limit, search, role, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(status === 'ACTIVE'
        ? { isActive: true }
        : status === 'LOCKED'
          ? { isActive: false }
          : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async updateUser(adminId: string, targetUserId: string, dto: AdminUpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }

    if (adminId === targetUserId && dto.isActive === false) {
      throw new BadRequestException('Bạn không thể tự khóa tài khoản của chính mình');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (dto.isActive === false) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return updated;
  }

  // ==================== 3. QUẢN LÝ BÀI ĐỌC HIỂU ====================
  async listReadingTopics() {
    const rows = await this.prisma.readingPassage.findMany({
      distinct: ['topic'],
      select: { topic: true },
      orderBy: { topic: 'asc' },
    });
    return rows.map((r) => r.topic);
  }

  async listReading(query: AdminListReadingDto) {
    const { page, limit, search, topic, cefr } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ReadingPassageWhereInput = {
      ...(cefr ? { cefr } : {}),
      ...(topic ? { topic } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { summary: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.readingPassage.findMany({
        where,
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          content: true,
          topic: true,
          cefr: true,
          estimatedMinutes: true,
          sortOrder: true,
          createdAt: true,
          _count: { select: { questions: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.readingPassage.count({ where }),
    ]);

    const items = rows.map((r, index) => {
      const stt = skip + index + 1;
      const wordCount = r.content.trim().split(/\s+/).filter(Boolean).length;
      return {
        id: r.id,
        code: `BD${String(stt).padStart(3, '0')}`,
        slug: r.slug,
        title: r.title,
        summary: r.summary,
        topic: r.topic,
        cefr: r.cefr,
        wordCount,
        estimatedMinutes: r.estimatedMinutes,
        questionCount: r._count.questions,
        createdAt: r.createdAt,
      };
    });

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async updateReading(id: string, dto: AdminUpdateReadingDto) {
    const existing = await this.prisma.readingPassage.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy bài đọc hiểu');
    }

    return this.prisma.readingPassage.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.topic !== undefined ? { topic: dto.topic } : {}),
        ...(dto.cefr !== undefined ? { cefr: dto.cefr } : {}),
        ...(dto.estimatedMinutes !== undefined ? { estimatedMinutes: dto.estimatedMinutes } : {}),
      },
    });
  }

  async deleteReading(id: string) {
    const existing = await this.prisma.readingPassage.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy bài đọc hiểu');
    }

    await this.prisma.readingPassage.delete({ where: { id } });
    return { message: 'Đã xóa bài đọc hiểu thành công' };
  }
}
