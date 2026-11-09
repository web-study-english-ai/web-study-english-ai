import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
const cefrEnum = z.enum(['A1', 'A2', 'B1', 'B2']);
const posEnum = z.enum([
  'NOUN',
  'VERB',
  'ADJECTIVE',
  'ADVERB',
  'PREPOSITION',
  'PRONOUN',
  'CONJUNCTION',
  'INTERJECTION',
  'NUMERAL',
]);
export const adminListWordsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  topicId: z.string().uuid().optional(),
  cefr: cefrEnum.optional(),
});
export class AdminListWordsDto extends createZodDto(adminListWordsSchema) {}
export const adminUpdateWordSchema = z.object({
  term: z.string().trim().min(1, 'Từ vựng không được để trống').optional(),
  pos: posEnum.optional(),
  cefr: cefrEnum.optional(),
  ipa: z.string().trim().nullable().optional(),
  meaningVi: z.string().trim().min(1, 'Nghĩa tiếng Việt không được để trống').optional(),
  exampleEn: z.string().trim().nullable().optional(),
  topicId: z.string().uuid().nullable().optional(),
});
export class AdminUpdateWordDto extends createZodDto(adminUpdateWordSchema) {}
export const adminListUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
  status: z.enum(['ACTIVE', 'LOCKED']).optional(),
});
export class AdminListUsersDto extends createZodDto(adminListUsersSchema) {}
export const adminUpdateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
  isActive: z.boolean().optional(),
});
export class AdminUpdateUserDto extends createZodDto(adminUpdateUserSchema) {}
export const adminListReadingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  topic: z.string().trim().optional(),
  cefr: cefrEnum.optional(),
});
export class AdminListReadingDto extends createZodDto(adminListReadingSchema) {}
export const adminUpdateReadingSchema = z.object({
  title: z.string().trim().min(1).optional(),
  summary: z.string().trim().optional(),
  content: z.string().trim().min(1).optional(),
  topic: z.string().trim().min(1).optional(),
  cefr: cefrEnum.optional(),
  estimatedMinutes: z.coerce.number().int().min(1).max(120).optional(),
});
export class AdminUpdateReadingDto extends createZodDto(adminUpdateReadingSchema) {}
