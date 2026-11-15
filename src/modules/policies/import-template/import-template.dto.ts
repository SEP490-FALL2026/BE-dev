import { z } from 'zod';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { IMPORT_TEMPLATE_KINDS } from '../public/policies.types';

export const importTemplateParamSchema = z.strictObject({ kind: z.enum(IMPORT_TEMPLATE_KINDS) });

export const importTemplateQuerySchema = z.strictObject({
  format: z.enum(['xlsx', 'csv']).optional().meta({
    description:
      'xlsx: a sheet of data and a sheet of instructions; csv: UTF-8 with a byte order mark. Left out, the format the parser of that file reads first; one it does not read is refused.',
  }),
});

export class ImportTemplateParamDto extends createZodDto(importTemplateParamSchema) {}
export class ImportTemplateQueryDto extends createZodDto(importTemplateQuerySchema) {}
