import { Injectable } from '@nestjs/common';
import { fromDateColumn } from '../../../core/business-date';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AssessmentRecord, ProposalRecord, Quote } from './assessment-record.types';

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

/** The reads of `access_request_proposals` and `access_request_assessments`; `AssessmentRepo` is their one writer. */
@Injectable()
export class AssessmentReadRepo {
  constructor(private readonly prisma: PrismaService) {}

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
}
