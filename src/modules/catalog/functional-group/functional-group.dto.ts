import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const status = z.enum(['ACTIVE', 'INACTIVE']);

/** Only bounded here: whether a name is empty or over 200 characters answers with its own `FUNCTIONAL_GROUP.*` code. */
export const createFunctionalGroupBodySchema = z.strictObject({ name: z.string().max(1000) });
export const updateFunctionalGroupBodySchema = z.strictObject({
  name: z.string().max(1000).optional(),
  status: status.optional(),
});
export const listFunctionalGroupsQuerySchema = z.strictObject({
  status: status.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export const functionalGroupIdParamSchema = z.strictObject({ id: z.uuid() });

const groupSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  status,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export class CreateFunctionalGroupBodyDto extends createZodDto(createFunctionalGroupBodySchema) {}
export class UpdateFunctionalGroupBodyDto extends createZodDto(updateFunctionalGroupBodySchema) {}
export class ListFunctionalGroupsQueryDto extends createZodDto(listFunctionalGroupsQuerySchema) {}
export class FunctionalGroupIdParamDto extends createZodDto(functionalGroupIdParamSchema) {}
export class FunctionalGroupResponseDto extends createZodDto(successEnvelopeSchema(groupSchema)) {}
export class FunctionalGroupPageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(groupSchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}
