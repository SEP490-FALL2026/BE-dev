import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

/**
 * Only the shape and a generous bound are checked here. Whether a share is above 0 and up to 100 with at most two
 * decimals, the shares add up to 100%, a Cost Center is repeated, exists and is in use, or there are from one to twenty
 * lines is judged by the allocation policy and answers with its own `COST_ALLOCATION.*` code. A share is text, never a
 * JSON number (ADR-0007).
 */
export const declareCostAllocationBodySchema = z.strictObject({
  lines: z.array(z.strictObject({ costCenterId: z.uuid(), ratioPercent: z.string().max(20) })).max(100),
});

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
export const costAllocationHistoryQuerySchema = z.strictObject(pageQuery);

const lineSchema = z.strictObject({
  costCenterId: z.uuid(),
  costCenterCode: z.string(),
  costCenterName: z.string(),
  costCenterKind: z.enum(['UNIT', 'COMPANY']),
  ratioPercent: z.string(),
});
const allocationSchema = z.strictObject({
  version: z.number().int().positive(),
  lines: z.array(lineSchema),
  totalPercent: z.string(),
  declaredBy: z.uuid(),
  declaredAt: z.iso.datetime(),
});
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class DeclareCostAllocationBodyDto extends createZodDto(declareCostAllocationBodySchema) {}
export class CostAllocationHistoryQueryDto extends createZodDto(costAllocationHistoryQuerySchema) {}
export class CostAllocationResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      subscriptionId: z.uuid(),
      applicability: z.enum(['APPLICABLE', 'PER_SEAT', 'PRICING_MODEL_UNDECLARED']),
      status: z.enum(['DECLARED', 'MISSING']),
      allocation: allocationSchema.nullable(),
    }),
  ),
) {}
export class DeclaredCostAllocationResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ allocation: allocationSchema, changed: z.boolean() })),
) {}
export class CostAllocationHistoryResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(allocationSchema), pagination })),
) {}
