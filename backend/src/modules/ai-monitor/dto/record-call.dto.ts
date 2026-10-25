import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AiServiceTypeEnum = z.enum([
  'FSRS_RETENTION',
  'LLM_ASSISTANT_RAG',
  'VISION_CLIP',
  'HEALTH_PING',
]);

export type AiServiceType = z.infer<typeof AiServiceTypeEnum>;

export const recordCallSchema = z.object({
  serviceType: AiServiceTypeEnum,
  promptTokens: z.number().int().min(0).default(0),
  completionTokens: z.number().int().min(0).default(0),
  latencyMs: z.number().min(0),
  success: z.boolean(),
  statusCode: z.number().int().optional(),
  modelName: z.string().optional(),
  error: z.string().optional(),
});

export class RecordCallDto extends createZodDto(recordCallSchema) {}
