import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { COST_CENTER_CODE_MAX_LENGTH, COST_CENTER_CODE_PATTERN } from '../cost-center-name';

/**
 * Only bounded here: whether the kind is supported, and whether the name is empty, reserved or too long, is judged
 * by the service and answers with its own error code (US-04-09 AC-4).
 */
export const createCostCenterBodySchema = z.strictObject({
  code: z.string().trim().min(1).max(COST_CENTER_CODE_MAX_LENGTH).regex(COST_CENTER_CODE_PATTERN),
  name: z.string().max(1000),
  kind: z.string().max(40),
});

export const renameCostCenterBodySchema = z.strictObject({ name: z.string().max(1000) });

export const listCostCentersQuerySchema = z.strictObject({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  kind: z.enum(['UNIT', 'COMPANY']).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const listCostCenterEmployeesQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const costCenterIdParamSchema = z.strictObject({ id: z.uuid() });

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const costCenterSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  kind: z.enum(['UNIT', 'COMPANY']),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deactivatedAt: z.iso.datetime().nullable(),
});

const costCenterPageSchema = z.strictObject({ items: z.array(costCenterSchema), pagination });

/** What Finance may see of a person in a cost center's scope: no email, contract type, dates or manager (`QĐ-41c`). */
const costCenterEmployeesSchema = z.strictObject({
  costCenter: z.strictObject({ id: z.uuid(), code: z.string() }),
  items: z.array(
    z.strictObject({
      employeeCode: z.string(),
      fullName: z.string(),
      status: z.literal('WORKING'),
    }),
  ),
  pagination,
});

export class CreateCostCenterBodyDto extends createZodDto(createCostCenterBodySchema) {}
export class RenameCostCenterBodyDto extends createZodDto(renameCostCenterBodySchema) {}
export class ListCostCentersQueryDto extends createZodDto(listCostCentersQuerySchema) {}
export class ListCostCenterEmployeesQueryDto extends createZodDto(listCostCenterEmployeesQuerySchema) {}
export class CostCenterIdParamDto extends createZodDto(costCenterIdParamSchema) {}
export class CostCenterResponseDto extends createZodDto(successEnvelopeSchema(costCenterSchema)) {}
export class CostCenterPageResponseDto extends createZodDto(successEnvelopeSchema(costCenterPageSchema)) {}
export class CostCenterEmployeesResponseDto extends createZodDto(successEnvelopeSchema(costCenterEmployeesSchema)) {}
