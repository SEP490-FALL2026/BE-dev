import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const text = (max: number) => z.string().trim().min(1).max(max);

/** The five sections of the notice and the two flags; the organization, the publisher and the time are the server's. */
export const noticeVersionBodySchema = z.strictObject({
  collected: text(4000),
  notCollected: text(4000),
  purpose: text(4000),
  retention: text(4000),
  stopRight: text(4000),
  includesToolStatus: z.boolean(),
  requiresReacknowledgement: z.boolean(),
});

export const monitoringNoticeSchema = z.strictObject({
  id: z.uuid(),
  versionNumber: z.number().int().positive(),
  collected: z.string(),
  notCollected: z.string(),
  purpose: z.string(),
  retention: z.string(),
  stopRight: z.string(),
  includesToolStatus: z.boolean(),
  requiresReacknowledgement: z.boolean(),
  publishedAt: z.iso.datetime(),
});

export class NoticeVersionBodyDto extends createZodDto(noticeVersionBodySchema) {}
export class MonitoringNoticeResponseDto extends createZodDto(successEnvelopeSchema(monitoringNoticeSchema)) {}
