import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const askAssistantSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, { error: 'Câu hỏi không được để trống' })
    .max(1000, { error: 'Câu hỏi tối đa 1000 ký tự' }),
  wordId: z.uuid({ error: 'Mã từ không hợp lệ' }).optional(),
  clientEventId: z.uuid({ error: 'Mã sự kiện không hợp lệ' }).optional(),
});

export class AskAssistantDto extends createZodDto(askAssistantSchema) {}
