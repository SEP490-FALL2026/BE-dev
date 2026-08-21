import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

export const catalogApplicationStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'UNDER_REVIEW']);

export const catalogApplicationSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  vendor: z.string(),
  status: catalogApplicationStatusSchema,
  createdAt: z.iso.datetime(),
});

export const catalogApplicationPageSchema = z.strictObject({
  items: z.array(catalogApplicationSchema),
  pagination: z.strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export class CatalogApplicationResponseDto extends createZodDto(successEnvelopeSchema(catalogApplicationSchema)) {}
export class CatalogApplicationPageResponseDto extends createZodDto(
  successEnvelopeSchema(catalogApplicationPageSchema),
) {}
