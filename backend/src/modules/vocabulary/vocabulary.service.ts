import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ListWordsDto } from './dto/list-words.dto';
import { DictionaryService } from '@modules/dictionary/dictionary.service';

const wordListSelect = {
  id: true,
  term: true,
  rank: true,
  cefr: true,
  pos: true,
  ipa: true,
  meaningVi: true,
  topic: { select: { id: true, slug: true, name: true } },
} as const;

const wordDetailSelect = {
  ...wordListSelect,
  exampleEn: true,
  isConcreteNoun: true,
  freqPerMillion: true,
} as const;

@Injectable()
export class VocabularyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dictionaryService: DictionaryService,
  ) {}

  async listTopics() {
    return this.prisma.topic.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, slug: true, name: true, nameEn: true, sortOrder: true },
    });
  }

  async listWords(query: ListWordsDto) {
    const { page, limit, search, cefr, topicId, sort } = query;

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
        select: wordListSelect,
        orderBy: sort === 'term' ? { term: 'asc' } : { rank: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.word.count({ where }),
    ]);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async getWordById(id: string) {
    const word = await this.prisma.word.findUnique({
      where: { id },
      select: wordDetailSelect,
    });

    if (!word) {
      throw new NotFoundException('Không tìm thấy từ vựng');
    }

    const pronunciation = await this.dictionaryService.lookup(word.term, word.ipa);

    return { ...word, pronunciation };
  }
}
