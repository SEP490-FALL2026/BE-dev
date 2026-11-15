import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const moneyView = z.strictObject({ amount: z.string(), currency: z.string() });
/** An amount Finance types: in the reporting currency of the organization, which the client never names. */
const amountInput = z.strictObject({ amount: z.string().max(40) });
const kind = z.enum(['SUPPLEMENT', 'TRANSFER', 'RETURN', 'CEILING_REDUCTION']).meta({
  description:
    'SUPPLEMENT: a Cost Center is given money from what is not allocated under the annual ceiling. TRANSFER: money moves from one Cost Center to another. RETURN: a Cost Center gives money back to what is not allocated. CEILING_REDUCTION: the annual ceiling goes down, from what is not allocated.',
});
const state = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

export const createAdjustmentBodySchema = z.strictObject({
  year: z
    .number()
    .int()
    .min(2000)
    .max(2999)
    .meta({ description: 'The fiscal year whose budget is adjusted, as YYYY.' }),
  kind,
  fromCostCenterId: z.uuid().optional().meta({
    description: 'The Cost Center that gives: required for TRANSFER and RETURN, not allowed for the other two kinds.',
  }),
  toCostCenterId: z.uuid().optional().meta({
    description:
      'The Cost Center that receives: required for SUPPLEMENT and TRANSFER, not allowed for the other two kinds.',
  }),
  amount: amountInput.meta({
    description: 'The amount, above nothing, in the reporting currency of the organization.',
  }),
  reason: z.string().trim().min(1).max(1000),
  transferReason: z.enum(['COST_CENTER_CHANGE']).optional().meta({
    description:
      'Only for TRANSFER: the department changed its Cost Center in the year and what is left moves to the new one; such a transfer is not held to the forecast of the end of the year.',
  }),
});

export const adjustmentQuerySchema = z.strictObject({
  year: z.coerce.number().int().min(2000).max(2999).optional(),
  costCenterId: z
    .uuid()
    .optional()
    .meta({ description: 'Only the adjustments that give to or take from this Cost Center.' }),
  state: state.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const adjustmentIdParamSchema = z.strictObject({ id: z.uuid() });

export const decideAdjustmentBodySchema = z.strictObject({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().min(1).max(1000).optional().meta({ description: 'Required when the decision is REJECT.' }),
});

const person = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });
const costCenter = z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() });

const adjustmentSchema = z.strictObject({
  id: z.uuid(),
  year: z.number().int(),
  kind,
  from: costCenter
    .nullable()
    .meta({ description: 'The Cost Center that gives; null for a supplement and for a reduction of the ceiling.' }),
  to: costCenter
    .nullable()
    .meta({ description: 'The Cost Center that receives; null for a return and for a reduction of the ceiling.' }),
  amount: moneyView,
  reason: z.string(),
  transferReason: z.enum(['COST_CENTER_CHANGE']).nullable(),
  state,
  createdBy: person.nullable(),
  createdAt: z.iso.datetime(),
  decidedBy: person.nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decisionReason: z.string().nullable(),
  createdVersionId: z.uuid().nullable().meta({
    description:
      'The version of the budget made for the Cost Center that received money when it had none; null otherwise.',
  }),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class CreateAdjustmentBodyDto extends createZodDto(createAdjustmentBodySchema) {}
export class AdjustmentQueryDto extends createZodDto(adjustmentQuerySchema) {}
export class AdjustmentIdParamDto extends createZodDto(adjustmentIdParamSchema) {}
export class DecideAdjustmentBodyDto extends createZodDto(decideAdjustmentBodySchema) {}
export class AdjustmentResponseDto extends createZodDto(successEnvelopeSchema(adjustmentSchema)) {}
export class AdjustmentListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(adjustmentSchema), pagination })),
) {}

export type AdjustmentWire = z.infer<typeof adjustmentSchema>;
