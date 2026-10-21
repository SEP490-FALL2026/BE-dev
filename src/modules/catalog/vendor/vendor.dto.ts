import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

/**
 * Only the shape and a generous bound are checked here. Whether a tax name is empty or repeated, a rate is a percentage
 * of at most two decimals between 0 and 100, or there are more than twenty taxes is judged by the profile policy and
 * answers with its own `VENDOR_TAX_PROFILE.*` code. Money is text, never a JSON number (ADR-0007).
 */
const group = z.enum(['T1', 'T2', 'T3']);
const payer = z.enum(['VENDOR_COLLECTS', 'BUYER_REMITS']);

export const declareTaxProfileBodySchema = z.strictObject({
  group: group.optional(),
  lines: z
    .array(z.strictObject({ taxType: z.string().max(1000), ratePercent: z.string().max(20), deductible: z.boolean() }))
    .max(100),
});

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
export const listVendorsQuerySchema = z.strictObject({
  search: z.string().max(100).optional(),
  taxProfile: z.enum(['DECLARED', 'MISSING']).optional(),
  ...pageQuery,
});
export const historyQuerySchema = z.strictObject(pageQuery);
export const taxEstimateQuerySchema = z.strictObject({
  netAmount: z.string().max(40),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export const vendorIdParamSchema = z.strictObject({ id: z.uuid() });

const lineSchema = z.strictObject({
  taxType: z.string(),
  ratePercent: z.string(),
  deductible: z.boolean(),
  payer,
});
const profileSchema = z.strictObject({
  group,
  lines: z.array(lineSchema),
  version: z.number().int().positive(),
  declaredBy: z.uuid(),
  declaredAt: z.iso.datetime(),
});
const vendorSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  dictionaryGroupId: z.uuid().nullable(),
  taxProfileStatus: z.enum(['DECLARED', 'MISSING']),
  taxGroup: group.nullable(),
});
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
const taxProfileResponseSchema = z.strictObject({
  vendorId: z.uuid(),
  status: z.enum(['DECLARED', 'MISSING']),
  profile: profileSchema.nullable(),
  defaultProfile: z.strictObject({ group, lines: z.array(lineSchema) }),
});
const estimateSchema = z.strictObject({
  basis: z.enum(['PROFILE', 'DEFAULT_NO_PROFILE']),
  label: z.enum(['ESTIMATE', 'ESTIMATE_NO_PROFILE']),
  group,
  currency: z.string(),
  netAmount: z.string(),
  taxAmount: z.string(),
  deductibleTaxAmount: z.string(),
  nonDeductibleTaxAmount: z.string(),
  estimatedCost: z.string(),
  lines: z.array(lineSchema.extend({ taxAmount: z.string() })),
});

export class DeclareTaxProfileBodyDto extends createZodDto(declareTaxProfileBodySchema) {}
export class ListVendorsQueryDto extends createZodDto(listVendorsQuerySchema) {}
export class TaxProfileHistoryQueryDto extends createZodDto(historyQuerySchema) {}
export class TaxEstimateQueryDto extends createZodDto(taxEstimateQuerySchema) {}
export class VendorIdParamDto extends createZodDto(vendorIdParamSchema) {}
export class VendorPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(vendorSchema), pagination })),
) {}
export class TaxProfileResponseDto extends createZodDto(successEnvelopeSchema(taxProfileResponseSchema)) {}
export class DeclaredTaxProfileResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ profile: profileSchema, changed: z.boolean() })),
) {}
export class TaxProfileHistoryResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(profileSchema), pagination })),
) {}
export class TaxEstimateResponseDto extends createZodDto(successEnvelopeSchema(estimateSchema)) {}
