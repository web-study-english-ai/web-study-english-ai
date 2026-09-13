import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createReviewSchema = z.object({
  cardId: z.uuid({ error: 'Mã thẻ không hợp lệ' }),
  rating: z.coerce
    .number()
    .int()
    .min(1, { error: 'Mức đánh giá từ 1 đến 4' })
    .max(4, { error: 'Mức đánh giá từ 1 đến 4' }),
  durationMs: z.coerce.number().int().min(0).max(600000),
  reviewedAt: z.iso.datetime({ error: 'Thời điểm ôn phải theo định dạng ISO 8601' }).optional(),
});

export class CreateReviewDto extends createZodDto(createReviewSchema) {}
