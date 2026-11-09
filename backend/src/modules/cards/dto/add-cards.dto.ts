import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const addCardsSchema = z.object({
  wordIds: z
    .array(z.uuid({ error: 'Mã từ không hợp lệ' }))
    .min(1, { error: 'Phải chọn ít nhất 1 từ' })
    .max(50, { error: 'Mỗi lần chỉ thêm tối đa 50 từ' }),
  imageUrl: z
    .string()
    .trim()
    .max(2048, { error: 'Đường dẫn ảnh không được quá 2048 ký tự' })
    .nullable()
    .optional(),
  force: z.boolean().default(false),
});

export class AddCardsDto extends createZodDto(addCardsSchema) {}
