import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const readingAnswerItemSchema = z.object({
  questionId: z.string().trim().min(1, { error: 'Mã câu hỏi không được để trống' }),
  selectedOptionIndex: z.coerce
    .number()
    .int()
    .min(0, { error: 'Chỉ số phương án chọn không hợp lệ' }),
});

export const attemptReadingSchema = z.object({
  durationSeconds: z.coerce
    .number()
    .int()
    .min(0, { error: 'Thời gian làm bài không được âm' })
    .max(86400, { error: 'Thời gian làm bài vượt quá giới hạn' })
    .default(0),
  answers: z.array(readingAnswerItemSchema).max(100).default([]),
});

export class AttemptReadingDto extends createZodDto(attemptReadingSchema) {}
