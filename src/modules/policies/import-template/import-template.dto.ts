import { z } from 'zod';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { IMPORT_TEMPLATE_KINDS } from '../public/policies.types';

export const importTemplateParamSchema = z.strictObject({ kind: z.enum(IMPORT_TEMPLATE_KINDS) });

export const importTemplateQuerySchema = z.strictObject({
  format: z
    .enum(['xlsx', 'csv'])
    .default('xlsx')
    .meta({ description: 'xlsx: a sheet of data and a sheet of instructions; csv: UTF-8 with a byte order mark.' }),
});

export class ImportTemplateParamDto extends createZodDto(importTemplateParamSchema) {}
export class ImportTemplateQueryDto extends createZodDto(importTemplateQuerySchema) {}
