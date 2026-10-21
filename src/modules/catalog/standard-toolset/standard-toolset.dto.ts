import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

/**
 * Only the shape and a generous bound are checked here. Whether the reason is given (a missing one is taken as blank), the
 * plans exist and are not repeated, there are at most fifty, and the pair may take a toolset is judged by the toolset policy
 * and service and answers with its own `STANDARD_TOOLSET.*` code.
 */
export const setToolsetBodySchema = z.strictObject({
  planIds: z.array(z.uuid()).max(100),
  reason: z.string().max(1000).default(''),
});

export const toolsetPairParamSchema = z.strictObject({ departmentId: z.uuid(), jobTitleId: z.uuid() });

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
export const listToolsetsQuerySchema = z.strictObject({ departmentId: z.uuid().optional(), ...pageQuery });
export const toolsetHistoryQuerySchema = z.strictObject(pageQuery);

const toolsetSchema = z.strictObject({
  departmentId: z.uuid(),
  jobTitleId: z.uuid(),
  version: z.number().int().positive(),
  plans: z.array(
    z.strictObject({
      planId: z.uuid(),
      planName: z.string(),
      applicationId: z.uuid(),
      applicationName: z.string(),
    }),
  ),
  reason: z.string(),
  changedBy: z.uuid(),
  changedAt: z.iso.datetime(),
});
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class SetToolsetBodyDto extends createZodDto(setToolsetBodySchema) {}
export class ToolsetPairParamDto extends createZodDto(toolsetPairParamSchema) {}
export class ListToolsetsQueryDto extends createZodDto(listToolsetsQuerySchema) {}
export class ToolsetHistoryQueryDto extends createZodDto(toolsetHistoryQuerySchema) {}
export class ToolsetPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(toolsetSchema), pagination })),
) {}
export class ToolsetResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ toolset: toolsetSchema.nullable() })),
) {}
export class SetToolsetResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ toolset: toolsetSchema, changed: z.boolean() })),
) {}
export class MyToolsetResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
      jobTitle: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
      toolset: toolsetSchema.nullable(),
    }),
  ),
) {}
