import { z } from 'zod';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { REPLY_NOTE_MAX_LENGTH } from '../access-request/access-request.dto';

export const resubmitBodySchema = z.strictObject({
  replyNote: z.string().trim().min(1).max(REPLY_NOTE_MAX_LENGTH).optional(),
});

export class ResubmitAccessRequestDto extends createZodDto(resubmitBodySchema.default({})) {}
