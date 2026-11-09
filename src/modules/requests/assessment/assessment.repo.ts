import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { toDateColumn } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { AssessmentRecord, ProposalRecord, Quote } from '../access-request/assessment-record.types';

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

const QUOTE_CLEARED = {
  quoteUnitPriceMinor: null,
  quoteCurrency: null,
  quoteBillingCycle: null,
  quoteValidFrom: null,
  quoteValidUntil: null,
} satisfies Prisma.AccessRequestAssessmentUncheckedUpdateInput;

function quoteColumns(quote: Quote | null): Prisma.AccessRequestAssessmentUncheckedUpdateInput {
  if (quote === null) return QUOTE_CLEARED;

  return {
    quoteUnitPriceMinor: quote.unitPrice.amountMinor,
    quoteCurrency: quote.unitPrice.currency,
    quoteBillingCycle: quote.billingCycle,
    quoteValidFrom: toDateColumn(quote.validFrom),
    quoteValidUntil: quote.validUntil ? toDateColumn(quote.validUntil) : null,
  };
}

/** The one writer of `access_request_proposals` and `access_request_assessments`; their reads are `AssessmentReadRepo`'s. */
@Injectable()
export class AssessmentRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes what the Employee declared and opens the assessment, empty, for the IT Admin (`US-05-06` AC-1). */
  async open(tx: DbTx, requestId: string, proposal: ProposalRecord): Promise<void> {
    await tx.accessRequestProposal.create({ data: { requestId, ...proposal } });
    await tx.accessRequestAssessment.create({ data: { requestId } });
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
