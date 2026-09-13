import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const listDueCardsSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100, { error: 'Nhiều nhất 100 thẻ mỗi lần' })
    .optional(),
});

export class ListDueCardsDto extends createZodDto(listDueCardsSchema) {}
