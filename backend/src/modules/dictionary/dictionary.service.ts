import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DictionaryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

export type Pronunciation = {
  term: string;
  phoneticText: string | null;
  audioUrl: string | null;
  definitions: { partOfSpeech: string; definition: string }[];
  source: 'cache' | 'merriam-webster' | 'fallback';
  available: boolean;
};

type MwEntry = {
  meta?: { id?: string };
  fl?: string;
  shortdef?: string[];
  hwi?: {
    hw?: string;
    prs?: { mw?: string; sound?: { audio?: string } }[];
  };
};

@Injectable()
export class DictionaryService {
  private readonly logger = new Logger(DictionaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async lookup(rawTerm: string, fallbackIpa?: string | null): Promise<Pronunciation> {
    const term = rawTerm.trim().toLowerCase();

    const cached = await this.prisma.dictionaryEntry.findUnique({ where: { term } });
    if (cached && this.isCacheUsable(cached)) {
      return this.toPronunciation(term, cached, 'cache', fallbackIpa);
    }

    const fetched = await this.fetchFromApi(term);

    if (fetched === null) {
      // Dịch vụ lỗi: KHÔNG ghi cache, trả phiên âm sẵn có để giao diện vẫn hiển thị được
      return {
        term,
        phoneticText: fallbackIpa ?? null,
        audioUrl: null,
        definitions: [],
        source: 'fallback',
        available: false,
      };
    }

    const saved = await this.prisma.dictionaryEntry.upsert({
      where: { term },
      create: { term, ...fetched },
      update: { ...fetched, fetchedAt: new Date() },
    });

    return this.toPronunciation(term, saved, 'merriam-webster', fallbackIpa);
  }

  private isCacheUsable(entry: { status: DictionaryStatus; fetchedAt: Date }): boolean {
    if (entry.status === DictionaryStatus.FOUND) return true;

    const days = Number(this.config.get('DICTIONARY_NEGATIVE_CACHE_DAYS') ?? 7);
    return Date.now() - entry.fetchedAt.getTime() < days * 24 * 60 * 60 * 1000;
  }

  /** Trả dữ liệu để lưu, hoặc null khi dịch vụ lỗi (phân biệt với "tra không thấy") */
  /** Trả dữ liệu để lưu, hoặc null khi dịch vụ lỗi (phân biệt với "tra không thấy") */
  private async fetchFromApi(term: string) {
    const baseUrl = this.config.get<string>('DICTIONARY_API_URL');
    const apiKey = this.config.get<string>('DICTIONARY_API_KEY');
    const timeoutMs = Number(this.config.get('DICTIONARY_TIMEOUT_MS') ?? 3000);

    if (!apiKey) {
      this.logger.warn('Thiếu DICTIONARY_API_KEY, bỏ qua tra từ điển');
      return null;
    }

    try {
      const url = `${baseUrl}/${encodeURIComponent(term)}?key=${apiKey}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

      if (!response.ok) {
        this.logger.warn(`Từ điển trả mã ${response.status} cho từ "${term}"`);
        return null;
      }

      const raw = await response.text();

      if (raw.startsWith('Invalid API key')) {
        this.logger.error('DICTIONARY_API_KEY không hợp lệ hoặc chưa kích hoạt');
        return null;
      }

      const body = JSON.parse(raw) as unknown;

      // Không tìm thấy: API trả mảng rỗng, hoặc mảng chuỗi gợi ý thay vì mảng object
      if (!Array.isArray(body) || body.length === 0 || typeof body[0] === 'string') {
        return {
          phoneticText: null,
          audioUrl: null,
          definitions: Prisma.JsonNull,
          status: DictionaryStatus.NOT_FOUND,
        };
      }

      const entry = body[0] as MwEntry;

      return {
        phoneticText: entry.hwi?.prs?.find((p) => p.mw)?.mw ?? null,
        audioUrl: this.buildAudioUrl(entry),
        definitions: this.pickDefinitions(entry) as Prisma.InputJsonValue,
        status: DictionaryStatus.FOUND,
      };
    } catch (error) {
      this.logger.warn(`Không gọi được dịch vụ từ điển cho "${term}": ${String(error)}`);
      return null;
    }
  }

  /**
   * Merriam-Webster chỉ trả tên file audio, phải tự dựng URL.
   * Thư mục con theo quy tắc riêng của họ, không phải lúc nào cũng là chữ cái đầu.
   */
  private buildAudioUrl(entry: MwEntry): string | null {
    const audio = entry.hwi?.prs?.find((p) => p.sound?.audio)?.sound?.audio;
    if (!audio) return null;

    let subdir: string;
    if (audio.startsWith('bix')) subdir = 'bix';
    else if (audio.startsWith('gg')) subdir = 'gg';
    else if (/^[^a-zA-Z]/.test(audio)) subdir = 'number';
    else subdir = audio[0];

    return `https://media.merriam-webster.com/audio/prons/en/us/mp3/${subdir}/${audio}.mp3`;
  }

  private pickDefinitions(entry: MwEntry) {
    return (entry.shortdef ?? [])
      .slice(0, 3)
      .map((definition) => ({ partOfSpeech: entry.fl ?? '', definition }))
      .filter((d) => d.definition);
  }

  private toPronunciation(
    term: string,
    entry: {
      phoneticText: string | null;
      audioUrl: string | null;
      definitions: unknown;
      status: DictionaryStatus;
    },
    source: 'cache' | 'merriam-webster',
    fallbackIpa?: string | null,
  ): Pronunciation {
    const found = entry.status === DictionaryStatus.FOUND;

    return {
      term,
      phoneticText: entry.phoneticText ?? fallbackIpa ?? null,
      audioUrl: entry.audioUrl,
      definitions: found ? ((entry.definitions ?? []) as Pronunciation['definitions']) : [],
      source,
      available: found,
    };
  }
}
