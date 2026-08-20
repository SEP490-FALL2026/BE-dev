import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const errorCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)*$/);

export const errorEnvelopeSchema = z.strictObject({
  success: z.literal(false),
  error: z.strictObject({
    code: errorCodeSchema,
    message: z.string(),
    details: z.looseObject({}).optional(),
    requestId: z.string().min(1),
  }),
});

export class ErrorEnvelopeDto extends createZodDto(errorEnvelopeSchema) {}
