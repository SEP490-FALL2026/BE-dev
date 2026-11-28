import { z } from 'zod';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

export const resubmitBodySchema = z.strictObject({
  replyNote: z.string().trim().min(1).max(1000).optional(),
});

export class ResubmitAccessRequestDto extends createZodDto(resubmitBodySchema.default({})) {}
