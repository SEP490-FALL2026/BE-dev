import { z } from 'zod';

export interface SuccessEnvelope<T> {
  success: true;
  message: string;
  data: T | null;
}

export function successEnvelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.strictObject({
    success: z.literal(true),
    message: z.string().regex(/^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)+$/),
    data: dataSchema.nullable(),
  });
}
