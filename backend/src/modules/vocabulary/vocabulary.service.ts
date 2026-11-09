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

type WordListItem = Prisma.WordGetPayload<{ select: typeof wordListSelect }>;

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

  async listWords(query: ListWordsDto, userId?: string) {
    const { page, limit, search, cefr, topicId, sort } = query;
    const orderBy: Prisma.WordOrderByWithRelationInput =
      sort === 'term' ? { term: 'asc' } : { rank: 'asc' };
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

    if (userId) {
      const userCards = await this.prisma.userCard.findMany({
        where: { userId },
        select: { wordId: true },
      });
      const addedWordIds = userCards.map((c) => c.wordId);

      if (addedWordIds.length > 0) {
        const whereNotAdded: Prisma.WordWhereInput = {
          ...where,
          id: { notIn: addedWordIds },
        };
        const whereAdded: Prisma.WordWhereInput = {
          ...where,
          id: { in: addedWordIds },
        };

        const [notAddedCount, addedCount] = await this.prisma.$transaction([
          this.prisma.word.count({ where: whereNotAdded }),
          this.prisma.word.count({ where: whereAdded }),
        ]);

        const total = notAddedCount + addedCount;
        let items: WordListItem[] = [];

        if (skip + limit <= notAddedCount) {
          items = await this.prisma.word.findMany({
            where: whereNotAdded,
            select: wordListSelect,
            orderBy,
            skip,
            take: limit,
          });
        } else if (skip < notAddedCount) {
          const takeUnadded = notAddedCount - skip;
          const takeAdded = limit - takeUnadded;
          const [unaddedItems, addedItems] = await this.prisma.$transaction([
            this.prisma.word.findMany({
              where: whereNotAdded,
              select: wordListSelect,
              orderBy,
              skip,
              take: takeUnadded,
            }),
            this.prisma.word.findMany({
              where: whereAdded,
              select: wordListSelect,
              orderBy,
              skip: 0,
              take: takeAdded,
            }),
          ]);
          items = [...unaddedItems, ...addedItems];
        } else {
          items = await this.prisma.word.findMany({
            where: whereAdded,
            select: wordListSelect,
            orderBy,
            skip: skip - notAddedCount,
            take: limit,
          });
        }

        return {
          items,
          meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
        };
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.word.findMany({
        where,
        select: wordListSelect,
        orderBy,
        skip,
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
