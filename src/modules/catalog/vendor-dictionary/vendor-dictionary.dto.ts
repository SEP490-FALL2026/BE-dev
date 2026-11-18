import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/**
 * Only the shape and a generous bound are checked here. Whether a name is empty or over 200 characters, a domain is a
 * host, a pattern is 3 to 100 characters, or a list holds more than twenty values is judged by the service and answers
 * with its own `VENDOR_DICTIONARY.*` code.
 */
const text = z.string().max(1000);
const textList = z.array(z.string().max(1000)).max(100);

export const createGroupBodySchema = z.strictObject({ name: text, brandDomains: textList.optional() });
export const updateGroupBodySchema = z.strictObject({ name: text.optional(), brandDomains: textList.optional() });
export const createServiceLineBodySchema = z.strictObject({
  name: text,
  domains: textList.optional(),
  patterns: textList.optional(),
});
export const updateServiceLineBodySchema = z.strictObject({
  name: text.optional(),
  domains: textList.optional(),
  patterns: textList.optional(),
});
export const normalizeBodySchema = z.strictObject({
  kind: z.enum(['DOMAIN', 'DESCRIPTION']),
  value: z.string().max(500),
});
export const resolveProposalBodySchema = z.strictObject({
  outcome: z.enum(['ACCEPTED', 'DISMISSED']),
  serviceLineId: z.uuid().optional(),
});

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
export const listGroupsQuerySchema = z.strictObject({ search: z.string().max(100).optional(), ...pageQuery });
export const suggestQuerySchema = z.strictObject({ name: z.string().min(1).max(200) });
export const listProposalsQuerySchema = z.strictObject({
  status: z.enum(['PENDING', 'ACCEPTED', 'DISMISSED']).optional(),
  ...pageQuery,
});
export const idParamSchema = z.strictObject({ id: z.uuid() });

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const lineSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  domains: z.array(z.string()),
  patterns: z.array(z.string()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
const groupSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  brandDomains: z.array(z.string()),
  serviceLines: z.array(lineSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
const candidateSchema = z.strictObject({
  serviceLineId: z.uuid(),
  serviceLineName: z.string(),
  groupId: z.uuid(),
  groupName: z.string(),
});
const proposalSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(['PENDING', 'ACCEPTED', 'DISMISSED']),
  serviceLineId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});

export class CreateGroupBodyDto extends createZodDto(createGroupBodySchema) {}
export class UpdateGroupBodyDto extends createZodDto(updateGroupBodySchema) {}
export class CreateServiceLineBodyDto extends createZodDto(createServiceLineBodySchema) {}
export class UpdateServiceLineBodyDto extends createZodDto(updateServiceLineBodySchema) {}
export class NormalizeBodyDto extends createZodDto(normalizeBodySchema) {}
export class ResolveProposalBodyDto extends createZodDto(resolveProposalBodySchema) {}
export class ListGroupsQueryDto extends createZodDto(listGroupsQuerySchema) {}
export class SuggestQueryDto extends createZodDto(suggestQuerySchema) {}
export class ListProposalsQueryDto extends createZodDto(listProposalsQuerySchema) {}
export class IdParamDto extends createZodDto(idParamSchema) {}

export class VendorGroupResponseDto extends createZodDto(successEnvelopeSchema(groupSchema)) {}
export class VendorGroupPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(groupSchema), pagination })),
) {}
export class VendorServiceLineResponseDto extends createZodDto(successEnvelopeSchema(lineSchema)) {}
export class VendorSuggestionResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ candidates: z.array(candidateSchema) })),
) {}
export class VendorNormalizationResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({ method: z.enum(['DOMAIN', 'PATTERN']).nullable(), candidates: z.array(candidateSchema) }),
  ),
) {}
export class VendorProposalResponseDto extends createZodDto(successEnvelopeSchema(proposalSchema)) {}
export class VendorProposalPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(proposalSchema), pagination })),
) {}
