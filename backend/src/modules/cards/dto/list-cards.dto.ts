import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const listCardsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  state: z.enum(['NEW', 'LEARNING', 'REVIEW', 'RELEARNING']).optional(),
});

export class ListCardsDto extends createZodDto(listCardsSchema) {}
