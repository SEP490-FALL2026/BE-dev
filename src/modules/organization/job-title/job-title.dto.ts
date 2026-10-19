import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

/**
 * The name is only bounded here, generously: whether it is empty or too long is judged after the
 * normalization (whitespace removed), and answers with its own error code.
 */
const nameBodySchema = z.strictObject({ name: z.string().max(1000) });

export const listJobTitlesQuerySchema = z.strictObject({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const jobTitleIdParamSchema = z.strictObject({ id: z.uuid() });

const jobTitleSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const jobTitlePageSchema = z.strictObject({
  items: z.array(jobTitleSchema),
  pagination: z.strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export class JobTitleNameBodyDto extends createZodDto(nameBodySchema) {}
export class ListJobTitlesQueryDto extends createZodDto(listJobTitlesQuerySchema) {}
export class JobTitleIdParamDto extends createZodDto(jobTitleIdParamSchema) {}
export class JobTitleResponseDto extends createZodDto(successEnvelopeSchema(jobTitleSchema)) {}
export class JobTitlePageResponseDto extends createZodDto(successEnvelopeSchema(jobTitlePageSchema)) {}
