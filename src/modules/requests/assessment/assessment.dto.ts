import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import {
  REASON_MAX_LENGTH,
  TERM_MONTHS_MAX,
  employeeRef,
  moneySchema,
  pricingSchema,
} from '../access-request/access-request.dto';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';

/** A web address with a host: the homepage of the software, which a screen links to. */
function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);

    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
  } catch {
    return false;
  }
}

const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * `BM-02` as the Employee fills it when the software is not in the catalog (`US-05-06` AC-1): the name, the homepage, the
 * purpose, the data of the company that will go through it (required) and how many people will use it, with the term
 * asked for. The purpose is the reason of the request. Nothing here chooses the branch, the amount or who decides.
 */
export const proposalBodySchema = z.strictObject({
  softwareName: text(200),
  homepageUrl: z.string().trim().max(500).refine(isWebAddress, { message: 'Must be an http or https address.' }).meta({
    description: 'An absolute web address, http or https, with a host; surrounding whitespace is trimmed first.',
  }),
  purpose: text(REASON_MAX_LENGTH),
  dataDescription: text(REASON_MAX_LENGTH),
  expectedUsers: z.number().int().min(1).max(1_000_000),
  termMonths: z.number().int().min(1).max(TERM_MONTHS_MAX),
  expectedSpendOn: businessDate.optional(),
});

const moneyInput = z.strictObject({ amount: z.string().max(40), currency: z.string().regex(/^[A-Z]{3}$/) });

/** The quote the IT Admin records: what one person costs for one billing cycle, and how the contract binds and is paid. */
const quoteInput = z.strictObject({
  unitPrice: moneyInput,
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
  validFrom: businessDate,
  validUntil: businessDate.nullable().optional(),
  commitmentMonths: z.number().int().min(1).max(TERM_MONTHS_MAX).nullable().optional(),
  paymentFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL', 'UPFRONT_ONCE']).nullable().optional(),
  firstPaymentOn: businessDate.nullable().optional(),
});

/**
 * What the IT Admin gives of the assessment in one save: a field that is present is written, and the ones that can be
 * cleared take `null`. The classification has no free option (`QĐ-82n`): internal, or paid or licensed.
 */
export const assessmentPatchSchema = z
  .strictObject({
    classification: z.enum(['INTERNAL', 'PAID_LICENSED']),
    vendorId: z.uuid().nullable(),
    vendorName: text(200),
    plannedPlanName: text(200),
    provisioningType: z.enum(['K1', 'K2', 'K3', 'K4']),
    adminConsole: z.boolean(),
    memberExport: z.boolean(),
    sso: z.boolean(),
    termsSummary: text(2000),
    memberUsageMethod: text(REASON_MAX_LENGTH),
    grantRevokeMethod: text(REASON_MAX_LENGTH),
    dataSensitivity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    opinion: z
      .strictObject({ status: z.enum(['OBTAINED', 'NOT_AVAILABLE']), note: text(REASON_MAX_LENGTH).optional() })
      .nullable(),
    equivalentPlanId: z.uuid().nullable(),
    proposedBusinessOwnerEmployeeId: z.uuid().nullable(),
    controlLevel: z.enum(['FULL', 'PARTIAL', 'UNCONTROLLABLE']),
    controlRiskNote: text(REASON_MAX_LENGTH).nullable(),
    quote: quoteInput.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Give at least one field.' })
  .meta({
    minProperties: 1,
    description:
      'Give at least one field; a field that is present is written, and the ones that can be cleared take null.',
  });

export const catalogLinkBodySchema = z.strictObject({ planId: z.uuid() });

/**
 * The refusal at the gate of the assessment (`US-05-18`): the kind, which is either a tool that cannot be controlled or
 * software that is not eligible for the catalog (there is no outcome for free software, `QĐ-82n`), the reason that must
 * go with it, and the alternative when the IT Admin has one: a plan of the catalog, a note, or neither.
 */
export const assessmentRejectionBodySchema = z.strictObject({
  kind: z.enum(['UNCONTROLLABLE', 'NOT_ELIGIBLE']),
  reason: text(REASON_MAX_LENGTH),
  alternativePlanId: z.uuid().optional(),
  alternativeNote: text(REASON_MAX_LENGTH).optional(),
});

/**
 * Registering software the company built itself (`US-05-20`): its Business Owner, who must still work, and the name when it
 * is not the one proposed. A payment that the grant needs (`US-05-20` AC-10) comes with the quote that prices it.
 */
export const internalRegistrationBodySchema = z.strictObject({
  businessOwnerEmployeeId: z.uuid(),
  softwareName: text(200).optional(),
  dataSensitivity: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  spend: z.strictObject({ quote: quoteInput }).optional(),
});

const quoteView = z.strictObject({
  unitPrice: moneySchema,
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
  validFrom: z.string(),
  validUntil: z.string().nullable(),
  commitmentMonths: z.number().int().positive().nullable(),
  paymentFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL', 'UPFRONT_ONCE']).nullable(),
  firstPaymentOn: z.string().nullable(),
});

const assessmentSchema = z.strictObject({
  requestId: z.uuid(),
  status: z.enum(['DRAFT', 'COMPLETED', 'REJECTED']),
  proposal: z.strictObject({
    softwareName: z.string(),
    homepageUrl: z.string(),
    purpose: z.string(),
    dataDescription: z.string(),
    expectedUsers: z.number().int().positive(),
  }),
  /** The step of the IT Admin: who holds it, how long it may wait, and when it was done. */
  step: z
    .strictObject({
      state: z.enum(['PENDING', 'WAITING', 'APPROVED', 'REJECTED', 'CLOSED']),
      assignee: employeeRef.nullable(),
      waitingReason: z.string().nullable(),
      slaWorkingDays: z.number().int().positive(),
      assignedAt: z.iso.datetime().nullable(),
      decidedAt: z.iso.datetime().nullable(),
    })
    .nullable(),
  classification: z.enum(['INTERNAL', 'PAID_LICENSED']).nullable(),
  vendor: z.strictObject({ vendorId: z.uuid().nullable(), name: z.string().nullable() }),
  plannedPlanName: z.string().nullable(),
  provisioningType: z.enum(['K1', 'K2', 'K3', 'K4', 'K5']).nullable(),
  adminConsole: z.boolean().nullable(),
  memberExport: z.boolean().nullable(),
  sso: z.boolean().nullable(),
  termsSummary: z.string().nullable(),
  memberUsageMethod: z.string().nullable(),
  grantRevokeMethod: z.string().nullable(),
  dataSensitivity: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable(),
  opinion: z.strictObject({ status: z.enum(['OBTAINED', 'NOT_AVAILABLE']), note: z.string().nullable() }).nullable(),
  /** A tool already in the catalog that does the same work: a suggestion, never a gate (`US-05-06` AC-5). */
  equivalentTool: z.strictObject({ planId: z.uuid(), planName: z.string(), applicationName: z.string() }).nullable(),
  proposedBusinessOwner: employeeRef.nullable(),
  controlLevel: z.enum(['FULL', 'PARTIAL', 'UNCONTROLLABLE']).nullable(),
  controlRiskNote: z.string().nullable(),
  quote: quoteView.nullable(),
  /** Whether the assessment can be completed as it stands; what it still lacks is told when completing it is refused. */
  complete: z.boolean(),
  /** What the request costs now: missing until the assessment is completed with a quote in force. */
  pricing: pricingSchema,
  costEstimate: z
    .strictObject({
      label: z.enum(['ESTIMATE', 'ESTIMATE_NO_PROFILE']),
      basis: z.enum(['PROFILE', 'DEFAULT_NO_PROFILE']),
      taxGroup: z.string(),
      preTax: moneySchema,
      tax: moneySchema,
      deductibleTax: moneySchema,
      nonDeductibleTax: moneySchema,
      estimatedCost: moneySchema,
      totalPayable: moneySchema,
    })
    .nullable(),
  completedBy: employeeRef.nullable(),
  completedAt: z.iso.datetime().nullable(),
  /** The refusal at the gate, with the reason and the alternative; null unless the IT Admin refused. */
  rejection: z
    .strictObject({
      kind: z.enum(['UNCONTROLLABLE', 'NOT_ELIGIBLE']),
      reason: z.string(),
      alternative: z.strictObject({
        plan: z.strictObject({ planId: z.uuid(), planName: z.string(), applicationName: z.string() }).nullable(),
        note: z.string().nullable(),
      }),
      rejectedBy: employeeRef,
      rejectedAt: z.iso.datetime(),
    })
    .nullable(),
});

export class ProposalBodyDto extends createZodDto(proposalBodySchema) {}
export class AssessmentPatchDto extends createZodDto(assessmentPatchSchema) {}
export class CatalogLinkBodyDto extends createZodDto(catalogLinkBodySchema) {}
export class AssessmentRejectionBodyDto extends createZodDto(assessmentRejectionBodySchema) {}
export class InternalRegistrationBodyDto extends createZodDto(internalRegistrationBodySchema) {}
export class AssessmentResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ assessment: assessmentSchema })),
) {}
export type AssessmentWire = z.infer<typeof assessmentSchema>;
