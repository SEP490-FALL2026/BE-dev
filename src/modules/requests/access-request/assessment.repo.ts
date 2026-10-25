import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { fromDateColumn, toDateColumn } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { AssessmentFields } from './assessment.policy';
import type { Quote } from './quote-pricing.policy';

/** What the Employee declares when the software is not in the catalog (`US-05-06` AC-1). */
export interface ProposalRecord {
  softwareName: string;
  homepageUrl: string;
  purpose: string;
  dataDescription: string;
  expectedUsers: number;
}

/** The assessment as kept: the fields the rules judge and the ones that are only recorded. */
export interface AssessmentRecord extends AssessmentFields {
  status: 'DRAFT' | 'COMPLETED' | 'REJECTED';
  vendorId: string | null;
  equivalentPlanId: string | null;
  proposedBusinessOwnerEmployeeId: string | null;
  controlRiskNote: string | null;
  rejectionKind: 'UNCONTROLLABLE' | 'NOT_ELIGIBLE' | null;
  rejectionReason: string | null;
  alternativePlanId: string | null;
  alternativeNote: string | null;
  rejectedAt: Date | null;
  rejectedByEmployeeId: string | null;
  savedByEmployeeId: string | null;
  completedByEmployeeId: string | null;
  completedAt: Date | null;
  updatedAt: Date;
}

/** The fields the IT Admin gives or clears in one save: a key that is present is written, `null` clears it. */
export type AssessmentPatch = Partial<
  Omit<
    AssessmentRecord,
    | 'status'
    | 'savedByEmployeeId'
    | 'completedByEmployeeId'
    | 'completedAt'
    | 'updatedAt'
    | 'rejectionKind'
    | 'rejectionReason'
    | 'alternativePlanId'
    | 'alternativeNote'
    | 'rejectedAt'
    | 'rejectedByEmployeeId'
  >
>;

type Row = Prisma.AccessRequestAssessmentGetPayload<object>;

function toQuote(row: Row): Quote | null {
  if (
    row.quoteUnitPriceMinor === null ||
    row.quoteCurrency === null ||
    row.quoteBillingCycle === null ||
    row.quoteValidFrom === null ||
    row.quoteBillingCycle === 'OTHER'
  ) {
    return null;
  }

  return {
    unitPrice: { amountMinor: row.quoteUnitPriceMinor, currency: row.quoteCurrency },
    billingCycle: row.quoteBillingCycle,
    validFrom: fromDateColumn(row.quoteValidFrom),
    validUntil: row.quoteValidUntil ? fromDateColumn(row.quoteValidUntil) : null,
    commitmentMonths: row.commitmentMonths,
    paymentFrequency: row.paymentFrequency,
    firstPaymentOn: row.firstPaymentOn ? fromDateColumn(row.firstPaymentOn) : null,
  };
}

function toRecord(row: Row): AssessmentRecord {
  return {
    status: row.status,
    classification: row.classification,
    vendorId: row.vendorId,
    vendorName: row.vendorName,
    plannedPlanName: row.plannedPlanName,
    provisioningType: row.provisioningType,
    adminConsole: row.adminConsole,
    memberExport: row.memberExport,
    sso: row.sso,
    termsSummary: row.termsSummary,
    memberUsageMethod: row.memberUsageMethod,
    grantRevokeMethod: row.grantRevokeMethod,
    dataSensitivity: row.dataSensitivity,
    opinionStatus: row.opinionStatus,
    opinionNote: row.opinionNote,
    equivalentPlanId: row.equivalentPlanId,
    proposedBusinessOwnerEmployeeId: row.proposedBusinessOwnerEmployeeId,
    controlLevel: row.controlLevel,
    controlRiskNote: row.controlRiskNote,
    rejectionKind: row.rejectionKind,
    rejectionReason: row.rejectionReason,
    alternativePlanId: row.alternativePlanId,
    alternativeNote: row.alternativeNote,
    rejectedAt: row.rejectedAt,
    rejectedByEmployeeId: row.rejectedByEmployeeId,
    quote: toQuote(row),
    savedByEmployeeId: row.savedByEmployeeId,
    completedByEmployeeId: row.completedByEmployeeId,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
  };
}

const QUOTE_CLEARED = {
  quoteUnitPriceMinor: null,
  quoteCurrency: null,
  quoteBillingCycle: null,
  quoteValidFrom: null,
  quoteValidUntil: null,
  commitmentMonths: null,
  paymentFrequency: null,
  firstPaymentOn: null,
} satisfies Prisma.AccessRequestAssessmentUncheckedUpdateInput;

function quoteColumns(quote: Quote | null): Prisma.AccessRequestAssessmentUncheckedUpdateInput {
  if (quote === null) return QUOTE_CLEARED;

  return {
    quoteUnitPriceMinor: quote.unitPrice.amountMinor,
    quoteCurrency: quote.unitPrice.currency,
    quoteBillingCycle: quote.billingCycle,
    quoteValidFrom: toDateColumn(quote.validFrom),
    quoteValidUntil: quote.validUntil ? toDateColumn(quote.validUntil) : null,
    commitmentMonths: quote.commitmentMonths,
    paymentFrequency: quote.paymentFrequency,
    firstPaymentOn: quote.firstPaymentOn ? toDateColumn(quote.firstPaymentOn) : null,
  };
}

/** The one writer of `access_request_proposals` and `access_request_assessments`, and their reads. */
@Injectable()
export class AssessmentRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes what the Employee declared and opens the assessment, empty, for the IT Admin (`US-05-06` AC-1). */
  async open(tx: DbTx, requestId: string, proposal: ProposalRecord): Promise<void> {
    await tx.accessRequestProposal.create({ data: { requestId, ...proposal } });
    await tx.accessRequestAssessment.create({ data: { requestId } });
  }

  async findProposal(requestId: string, tx?: DbTx): Promise<ProposalRecord | null> {
    const row = await (tx ?? this.prisma).accessRequestProposal.findUnique({
      where: { requestId },
      select: { softwareName: true, homepageUrl: true, purpose: true, dataDescription: true, expectedUsers: true },
    });

    return row;
  }

  async findAssessment(requestId: string, tx?: DbTx): Promise<AssessmentRecord | null> {
    const row = await (tx ?? this.prisma).accessRequestAssessment.findUnique({ where: { requestId } });

    return row ? toRecord(row) : null;
  }

  /** Writes the fields given and who saved them; the others stay as they were. */
  async patch(tx: DbTx, requestId: string, patch: AssessmentPatch, savedByEmployeeId: string): Promise<void> {
    const { quote, ...fields } = patch;
    await tx.accessRequestAssessment.update({
      where: { requestId },
      data: {
        ...fields,
        ...(quote !== undefined ? quoteColumns(quote) : {}),
        savedByEmployeeId,
      },
    });
  }

  /** Records the refusal at the gate: what kind, why, the alternative if any, by whom and when (`US-05-18`). */
  async reject(
    tx: DbTx,
    requestId: string,
    refusal: {
      kind: 'UNCONTROLLABLE' | 'NOT_ELIGIBLE';
      reason: string;
      alternativePlanId: string | null;
      alternativeNote: string | null;
      employeeId: string;
      now: Date;
    },
  ): Promise<void> {
    await tx.accessRequestAssessment.update({
      where: { requestId },
      data: {
        status: 'REJECTED',
        // A tool that cannot be controlled is also the control level the assessment concludes.
        ...(refusal.kind === 'UNCONTROLLABLE' ? { controlLevel: 'UNCONTROLLABLE' as const } : {}),
        rejectionKind: refusal.kind,
        rejectionReason: refusal.reason,
        alternativePlanId: refusal.alternativePlanId,
        alternativeNote: refusal.alternativeNote,
        rejectedAt: refusal.now,
        rejectedByEmployeeId: refusal.employeeId,
      },
    });
  }

  async complete(tx: DbTx, requestId: string, employeeId: string, now: Date): Promise<void> {
    await tx.accessRequestAssessment.update({
      where: { requestId },
      data: { status: 'COMPLETED', completedByEmployeeId: employeeId, completedAt: now },
    });
  }
}
