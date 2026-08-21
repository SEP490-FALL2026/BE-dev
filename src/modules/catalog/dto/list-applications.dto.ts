import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { catalogApplicationStatusSchema } from './catalog-application.dto';

/**
 * Query strings are always strings, hence `z.coerce`. `strictObject` turns an unknown
 * parameter into a 422 rather than a silently ignored typo.
 */
export const listApplicationsQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: catalogApplicationStatusSchema.optional(),
});

export class ListApplicationsQueryDto extends createZodDto(listApplicationsQuerySchema) {}
