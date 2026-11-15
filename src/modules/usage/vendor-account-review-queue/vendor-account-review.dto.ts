import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/** The most proofs of payment one case outside the process is closed with. */
export const OUT_OF_PROCESS_DOCUMENTS_MAX = 20;

const source = z.enum(['NO_ASSIGNMENT', 'UNMATCHED_IDENTITY', 'INVOICE_DIFFERENCE', 'COLLECTOR_UNLISTED']);
const discrepancyState = z.enum(['OPEN', 'DECIDED']);
const decision = z.enum(['LEGALIZE_VIA_REQUEST', 'REVOKE', 'FALSE_ALARM', 'OUT_OF_PROCESS']);
const caseState = z.enum(['OPEN', 'CLOSED']);
const outcome = z.enum(['FALSE_ALARM', 'RECORD_SPENT', 'REPORT_ONLY']);

const moneyView = z.strictObject({ amount: z.string(), currency: z.string() });
/** An amount in dong, as typed: no currency (`QĐ-111an`). */
const dongInput = z.strictObject({ amount: z.string().max(40) });
const note = z.string().trim().min(1).max(1000);
const personRef = z.strictObject({ employeeId: z.uuid() });

export const vendorAccountDecisionSchema = z.strictObject({
  decision: decision.meta({
    description:
      'LEGALIZE_VIA_REQUEST when the account goes through a Request; REVOKE when the access is revoked; FALSE_ALARM when there is nothing wrong; OUT_OF_PROCESS when money or access was outside the process, which opens a case Finance or the IT Admin closes.',
  }),
  note: note.meta({ description: 'Why. Required; it stays with the difference.' }),
});

export const vendorAccountListQuerySchema = z.strictObject({
  state: discrepancyState.optional(),
  source: source.optional(),
  applicationId: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const outOfProcessClosureSchema = z.strictObject({
  outcome: outcome.meta({
    description:
      'FALSE_ALARM when nothing was spent; REPORT_ONLY to report it with the reason when there is no proof of payment; RECORD_SPENT to record the money already spent, which needs a proof of payment, an amount and a Cost Center or UNALLOCATED.',
  }),
  note: note.meta({ description: 'Why the case is closed this way. Required; it stays with the case.' }),
  documentIds: z.array(z.uuid()).min(1).max(OUT_OF_PROCESS_DOCUMENTS_MAX).optional().meta({
    description:
      'The proofs of payment of the company, finished uploads of purpose PURCHASE_DOCUMENT of the person who closes. Only for RECORD_SPENT, and then at least one.',
  }),
  amount: dongInput
    .optional()
    .meta({ description: 'What was spent, in dong. Only for RECORD_SPENT, and then above nothing.' }),
  costCenterId: z
    .union([z.uuid(), z.literal('UNALLOCATED')])
    .optional()
    .meta({
      description:
        'The Cost Center that bears the money, or UNALLOCATED when no department can be told yet. Only for RECORD_SPENT, and then required; for a shared tool Finance chooses one department.',
    }),
});

export const outOfProcessListQuerySchema = z.strictObject({
  state: caseState.optional(),
  outcome: outcome.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const applicationRef = z.strictObject({ id: z.uuid(), name: z.string() });

const discrepancySchema = z.strictObject({
  id: z.uuid(),
  source,
  state: discrepancyState,
  application: applicationRef
    .nullable()
    .meta({ description: 'The application the difference is about; null for an invoice or a tool.' }),
  vendorId: z.uuid().nullable(),
  employeeId: z
    .uuid()
    .nullable()
    .meta({ description: 'The person with activity and no seat, by id only; never a name.' }),
  identity: z.string().nullable().meta({ description: 'The account as the vendor wrote it, or the key of the tool.' }),
  internalValue: z.string().meta({ description: 'What the company has on record.' }),
  vendorValue: z.string().meta({ description: 'What the vendor shows.' }),
  evidenceOn: responseBusinessDate,
  firstSeenAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  decision: decision.nullable(),
  decisionNote: z.string().nullable(),
  decidedBy: personRef.nullable(),
  decidedAt: z.iso.datetime().nullable(),
  outOfProcessCaseId: z.uuid().nullable().meta({
    description:
      'The case an OUT_OF_PROCESS decision opened, or the one already open for the same account that it joined.',
  }),
  reopenedFromId: z.uuid().nullable().meta({
    description:
      'The decided difference of the same thing this one follows, when it was seen again with newer evidence after it was decided; null for a first sighting.',
  }),
});

const caseSchema = z.strictObject({
  id: z.uuid(),
  state: caseState,
  discrepancyId: z.uuid(),
  application: applicationRef.nullable(),
  vendorId: z.uuid().nullable(),
  openedAt: z.iso.datetime(),
  outcome: outcome.nullable(),
  note: z.string().nullable(),
  closedBy: personRef.nullable(),
  closedAt: z.iso.datetime().nullable(),
  amount: moneyView.nullable().meta({ description: 'What was recorded as spent, in dong; only for RECORD_SPENT.' }),
  costCenterId: z
    .uuid()
    .nullable()
    .meta({ description: 'The Cost Center that bears it; null with an amount means not allocated yet.' }),
  documentIds: z.array(z.uuid()).max(OUT_OF_PROCESS_DOCUMENTS_MAX),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class VendorAccountIdParamDto extends createZodDto(z.strictObject({ id: z.uuid() })) {}
export class VendorAccountDecisionBodyDto extends createZodDto(vendorAccountDecisionSchema) {}
export class VendorAccountListQueryDto extends createZodDto(vendorAccountListQuerySchema) {}
export class VendorAccountResponseDto extends createZodDto(successEnvelopeSchema(discrepancySchema)) {}
export class VendorAccountListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(discrepancySchema), pagination })),
) {}

export class OutOfProcessClosureBodyDto extends createZodDto(outOfProcessClosureSchema) {}
export class OutOfProcessListQueryDto extends createZodDto(outOfProcessListQuerySchema) {}
export class OutOfProcessResponseDto extends createZodDto(successEnvelopeSchema(caseSchema)) {}
export class OutOfProcessListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(caseSchema), pagination })),
) {}

export type VendorAccountWire = z.infer<typeof discrepancySchema>;
export type OutOfProcessCaseWire = z.infer<typeof caseSchema>;
