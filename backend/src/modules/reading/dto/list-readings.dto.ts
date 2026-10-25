import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const listReadingsSchema = z.object({
  page: z.coerce.number().int().min(1, { error: 'Trang nhỏ nhất là 1' }).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50, { error: 'Nhiều nhất 50 bài đọc mỗi trang' })
    .default(5),
  search: z.string().trim().min(1).max(100).optional(),
  cefr: z
    .enum(['A1', 'A2', 'B1', 'B2'], { error: 'Trình độ phải là A1, A2, B1 hoặc B2' })
    .optional(),
  topic: z.string().trim().min(1).max(100).optional(),
  status: z
    .enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'], {
      error: 'Trạng thái phải là NOT_STARTED, IN_PROGRESS hoặc COMPLETED',
    })
    .optional(),
  sort: z.enum(['recommended', 'level_asc', 'level_desc', 'newest']).default('recommended'),
});

export class ListReadingsDto extends createZodDto(listReadingsSchema) {}
