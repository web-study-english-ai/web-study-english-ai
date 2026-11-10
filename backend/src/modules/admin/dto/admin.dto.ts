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

export const importWordItemSchema = z.object({
  term: z.string().trim().min(1),
  pos: posEnum,
  cefr: cefrEnum,
  ipa: z.string().trim().nullable().optional(),
  meaningVi: z.string().trim().min(1),
  exampleEn: z.string().trim().nullable().optional(),
  topic: z.string().trim().min(1),
});

export const adminImportWordsSchema = z.object({
  words: z.array(importWordItemSchema).min(1, 'Danh sách từ nạp không được rỗng'),
});
export class AdminImportWordsDto extends createZodDto(adminImportWordsSchema) {}

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

export const adminCreateQuestionSchema = z.object({
  questionText: z.string().trim().min(1, 'Nội dung câu hỏi không được để trống'),
  options: z
    .array(z.string().trim().min(1, 'Phương án không được để trống'))
    .length(4, 'Phải có đúng 4 phương án lựa chọn'),
  correctOptionIndex: z.number().int().min(0).max(3, 'Chỉ số đáp án đúng từ 0 đến 3'),
  explanation: z.string().trim().optional(),
});

export const adminCreateReadingSchema = z.object({
  title: z.string().trim().min(1, 'Tiêu đề bài đọc không được để trống'),
  summary: z.string().trim().optional(),
  content: z.string().trim().min(10, 'Nội dung bài đọc phải có ít nhất 10 ký tự'),
  topic: z.string().trim().min(1, 'Chủ đề không được để trống'),
  cefr: cefrEnum,
  estimatedMinutes: z.coerce.number().int().min(1).max(120).default(5),
  questions: z.array(adminCreateQuestionSchema).min(1, 'Bài đọc phải có ít nhất 1 câu hỏi'),
});
export class AdminCreateReadingDto extends createZodDto(adminCreateReadingSchema) {}
