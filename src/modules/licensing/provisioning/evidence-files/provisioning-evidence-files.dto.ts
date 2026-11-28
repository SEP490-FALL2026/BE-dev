import { z } from 'zod';
import { createZodDto } from '../../../../infrastructure/http/dto/zod-dto';
import { successEnvelopeSchema } from '../../../../infrastructure/http/dto/success-envelope.dto';

const evidenceFileSchema = z.strictObject({
  id: z.uuid(),
  stage: z.enum(['COMPLETION', 'ACCESS_CUT']),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  attachedAt: z.iso.datetime(),
});
export class EvidenceFileParamDto extends createZodDto(z.strictObject({ id: z.uuid(), fileId: z.uuid() })) {}
export class EvidenceFileListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(evidenceFileSchema).max(6) })),
) {}
export class EvidenceFileLinkResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ url: z.string(), expiresAt: z.iso.datetime() })),
) {}
