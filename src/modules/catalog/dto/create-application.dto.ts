import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Separate from the response schema on purpose: the request needs trimming and bounds and
 * must never accept `id` or `createdAt`, which the server owns.
 */
export const createApplicationBodySchema = z.strictObject({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]*$/)
    .max(80),
  name: z.string().trim().min(1).max(200),
  vendor: z.string().trim().min(1).max(200),
});

export class CreateApplicationBodyDto extends createZodDto(createApplicationBodySchema) {}
