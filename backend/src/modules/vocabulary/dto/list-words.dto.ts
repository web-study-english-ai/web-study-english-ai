import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const listWordsSchema = z.object({
  page: z.coerce.number().int().min(1, { error: 'Trang nhỏ nhất là 1' }).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100, { error: 'Nhiều nhất 100 bản ghi mỗi trang' })
    .default(20),
  search: z.string().trim().min(1).max(50).optional(),
  cefr: z
    .enum(['A1', 'A2', 'B1', 'B2'], { error: 'Trình độ phải là A1, A2, B1 hoặc B2' })
    .optional(),
  topicId: z.uuid({ error: 'Mã chủ đề không hợp lệ' }).optional(),
  sort: z.enum(['rank', 'term']).default('rank'),
});

export class ListWordsDto extends createZodDto(listWordsSchema) {}
