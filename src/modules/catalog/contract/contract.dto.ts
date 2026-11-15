import { z } from 'zod';
import {
  BUSINESS_DATE_MESSAGE,
  businessDateSchema,
  responseBusinessDate,
} from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import {
  CONTRACT_DETAIL_ARRAY_MAX,
  MAX_CONTRACT_NOTE_LENGTH,
  MAX_CONTRACT_NUMBER_LENGTH,
  MAX_CONTRACT_REASON_LENGTH,
} from './contract-fields.policy';
import { MAX_CONTRACT_NAME_LENGTH, MAX_FILE_NAME_LENGTH, NEW_DOCUMENT_PURPOSES } from './contract.policy';

/** A day a request carries, worded as every date of a request is (it must exist) with what the day means. */
const day = (meaning: string) =>
  businessDateSchema(
    BUSINESS_DATE_MESSAGE,
    `${meaning} A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused).`,
  );

/**
 * Only the shape and a generous bound are checked here, and the body names no uploader and no organization: both come
 * from the signed-in person, so a request that tries to say otherwise is refused. Whether the purpose, the type and the
 * size are acceptable is judged by the policy and answers with its own `DOCUMENT.*` code. The same goes for a contract: its vendor,
 * its days and its number are judged by the policy and the service and answer with their own `CONTRACT.*` code.
 */
export const createContractBodySchema = z.strictObject({
  name: z.string().max(MAX_CONTRACT_NAME_LENGTH).default(''),
  vendorId: z
    .uuid()
    .optional()
    .meta({ description: 'The vendor of the contract, from the catalog. Needed to make one.' }),
  number: z.string().max(MAX_CONTRACT_NUMBER_LENGTH).nullable().optional().meta({
    description:
      'The number of the contract, if it has one: unique in the company, compared ignoring case, accents and extra spaces.',
  }),
  effectiveFrom: day('The day the contract begins. Needed to make one.').optional(),
  effectiveTo: day('The day the contract ends; empty when it never ends (a purchase for good).').nullable().optional(),
  note: z.string().max(MAX_CONTRACT_NOTE_LENGTH).nullable().optional(),
});
/** What is left out stays as it is; every change needs its reason. */
export const updateContractBodySchema = z.strictObject({
  name: z.string().max(MAX_CONTRACT_NAME_LENGTH).optional(),
  vendorId: z.uuid().optional().meta({ description: 'Refused while a subscription is linked to the contract.' }),
  number: z
    .string()
    .max(MAX_CONTRACT_NUMBER_LENGTH)
    .nullable()
    .optional()
    .meta({ description: 'null takes the number away.' }),
  effectiveFrom: day('The day the contract begins.').optional(),
  effectiveTo: day('The day the contract ends; null says the contract never ends.').nullable().optional(),
  note: z
    .string()
    .max(MAX_CONTRACT_NOTE_LENGTH)
    .nullable()
    .optional()
    .meta({ description: 'null takes the note away.' }),
  reason: z
    .string()
    .max(MAX_CONTRACT_REASON_LENGTH)
    .default('')
    .meta({ description: 'Why the contract is changed. Kept in the Audit Trail.' }),
});
export const listContractsQuerySchema = z.strictObject({
  search: z
    .string()
    .max(100)
    .optional()
    .meta({ description: 'Part of the name or of the number; case does not matter.' }),
  vendorId: z.uuid().optional(),
  status: z
    .enum(['INCOMPLETE', 'NOT_YET_EFFECTIVE', 'ACTIVE', 'EXPIRED'])
    .optional()
    .meta({ description: 'The status as of today.' }),
  effectiveOn: day('Only the contracts in effect on this day.').optional(),
  order: z
    .enum(['asc', 'desc'])
    .default('desc')
    .meta({ description: 'The order of the day the contract begins; those with none come last.' }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export const linkSubscriptionBodySchema = z.strictObject({ subscriptionId: z.uuid() });
export const contractSubscriptionParamSchema = z.strictObject({ id: z.uuid(), subscriptionId: z.uuid() });
/** What a new file may be declared as: no bank statement any more. */
const documentPurposeToDeclare = z.enum(NEW_DOCUMENT_PURPOSES);
/** What a stored file shows as its purpose: a file kept before as a bank statement still reads as one (`COST_STATEMENT`), though no new one is taken. */
const documentPurpose = z.enum([...NEW_DOCUMENT_PURPOSES, 'COST_STATEMENT']);
export const createDocumentBodySchema = z.strictObject({
  fileName: z
    .string()
    .min(1)
    .max(MAX_FILE_NAME_LENGTH * 2),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().nonnegative().max(1_000_000_000),
  purpose: documentPurposeToDeclare,
});
export const attachDocumentBodySchema = z.strictObject({ contractId: z.uuid() });
export const idParamSchema = z.strictObject({ id: z.uuid() });

const contractStatus = z.enum(['INCOMPLETE', 'NOT_YET_EFFECTIVE', 'ACTIVE', 'EXPIRED']).meta({
  description:
    'Read from the vendor and the days as of today: INCOMPLETE (no vendor or no beginning: an old contract that is only a name), NOT_YET_EFFECTIVE, ACTIVE (a contract with no end that has begun stays ACTIVE) and EXPIRED.',
});
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
/** What the list shows of a contract: to know it, filter it and open it. */
const contractSummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  number: z.string().nullable(),
  vendor: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  effectiveFrom: responseBusinessDate.nullable(),
  effectiveTo: responseBusinessDate.nullable().meta({ description: 'Null: the contract never ends.' }),
  status: contractStatus,
  subscriptionCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
const contractSubscriptionSchema = z.strictObject({
  subscriptionId: z.uuid(),
  status: z.enum(['DRAFT', 'ACTIVE']),
  kind: z.enum(['TERM', 'PERPETUAL']),
  startDate: responseBusinessDate.nullable(),
  endDate: responseBusinessDate.nullable(),
  planId: z.uuid(),
  planName: z.string(),
  provisioningType: z.enum(['K1', 'K2', 'K3', 'K4', 'K5']),
  applicationId: z.uuid(),
  applicationName: z.string(),
  logoUrl: z.string().nullable().meta({
    description:
      'The https link to the logo image of the application that the IT Admin pasted, or null. The server never checks it: show the first letter of the name when the image does not load.',
  }),
  linkedAt: z.iso.datetime(),
});
const contractDocumentSchema = z.strictObject({
  id: z.uuid(),
  purpose: documentPurpose,
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  attachedAt: z.iso.datetime(),
});
/** One contract as the detail shows it: the summary, and a bounded slice of its subscriptions, files and applications. */
const contractDetailSchema = contractSummarySchema.extend({
  note: z.string().nullable(),
  createdBy: z.uuid(),
  subscriptions: z.array(contractSubscriptionSchema).max(CONTRACT_DETAIL_ARRAY_MAX).meta({
    description:
      'The subscriptions linked to the contract, the last linked first. Only subscriptions of a shared stock (K2 or K4) are linked.',
  }),
  documents: z.array(contractDocumentSchema).max(CONTRACT_DETAIL_ARRAY_MAX).meta({
    description: 'The files attached to the contract that are ready, the last attached first. Open one with its link.',
  }),
  applicationIds: z.array(z.uuid()).max(CONTRACT_DETAIL_ARRAY_MAX).meta({
    description:
      'The applications of the linked subscriptions, each once. Read their usage sources from the usage sources of the application: a contract is not linked to a usage source.',
  }),
  truncated: z
    .strictObject({ subscriptions: z.boolean(), documents: z.boolean(), applicationIds: z.boolean() })
    .meta({ description: 'True for an array above that holds only the first of more than it lists.' }),
});
const documentSchema = z.strictObject({
  id: z.uuid(),
  purpose: documentPurpose,
  status: z.enum(['AWAITING_UPLOAD', 'PENDING_ATTACH', 'READY', 'QUARANTINED', 'EXPIRED']),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  uploadedBy: z.uuid(),
  createdAt: z.iso.datetime(),
  contractId: z.uuid().nullable(),
  attachedAt: z.iso.datetime().nullable(),
});

export class CreateContractBodyDto extends createZodDto(createContractBodySchema) {}
export class UpdateContractBodyDto extends createZodDto(updateContractBodySchema) {}
export class ListContractsQueryDto extends createZodDto(listContractsQuerySchema) {}
export class LinkSubscriptionBodyDto extends createZodDto(linkSubscriptionBodySchema) {}
export class ContractSubscriptionParamDto extends createZodDto(contractSubscriptionParamSchema) {}
export class CreateDocumentBodyDto extends createZodDto(createDocumentBodySchema) {}
export class AttachDocumentBodyDto extends createZodDto(attachDocumentBodySchema) {}
export class IdParamDto extends createZodDto(idParamSchema) {}
export class ContractResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ contract: contractDetailSchema })),
) {}
export class ContractPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(contractSummarySchema), pagination })),
) {}
export class ContractSubscriptionResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ subscription: contractSubscriptionSchema })),
) {}
export class DocumentResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ document: documentSchema })),
) {}
export class CreateDocumentResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      document: documentSchema,
      upload: z.strictObject({
        url: z.string(),
        method: z.enum(['PUT']),
        headers: z.record(z.string(), z.string()),
        expiresAt: z.iso.datetime(),
      }),
    }),
  ),
) {}
export class DocumentLinkResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ url: z.string(), expiresAt: z.iso.datetime() })),
) {}
