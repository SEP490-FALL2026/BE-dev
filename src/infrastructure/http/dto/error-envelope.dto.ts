import { z } from 'zod';
import { createZodDto } from './zod-dto';

export const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)*$/;

const errorCodeSchema = z.string().regex(ERROR_CODE_PATTERN);

export const errorEnvelopeSchema = z.strictObject({
  success: z.literal(false),
  error: z.strictObject({
    code: errorCodeSchema,
    message: z.string(),
    details: z.looseObject({}).optional(),
    requestId: z.string().min(1),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export class ErrorEnvelopeDto extends createZodDto(errorEnvelopeSchema) {}
