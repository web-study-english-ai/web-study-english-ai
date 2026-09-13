import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, { error: 'Họ và tên phải có ít nhất 2 ký tự' })
      .max(100, { error: 'Họ và tên không được quá 100 ký tự' })
      .optional(),

    avatarUrl: z.url({ error: 'Đường dẫn ảnh không hợp lệ' }).nullable().optional(),

    level: z
      .enum(['A1', 'A2', 'B1', 'B2'], {
        error: 'Trình độ phải là một trong A1, A2, B1, B2',
      })
      .optional(),

    newWordsPerDay: z
      .number()
      .int({ error: 'Số từ mới phải là số nguyên' })
      .min(1, { error: 'Ít nhất 1 từ mỗi ngày' })
      .max(100, { error: 'Nhiều nhất 100 từ mỗi ngày' })
      .optional(),

    maxReviewsPerDay: z
      .number()
      .int({ error: 'Số thẻ ôn tập phải là số nguyên' })
      .min(1, { error: 'Ít nhất 1 thẻ mỗi ngày' })
      .max(500, { error: 'Nhiều nhất 500 thẻ mỗi ngày' })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Phải có ít nhất một trường cần cập nhật',
  });

export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
