import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { TermsContent, TermsRecord } from './plan-terms.types';

type TermsRow = Prisma.PlanTermsGetPayload<object>;

const toTerms = (row: TermsRow): TermsRecord => ({
  planId: row.planId,
  termsUrl: row.termsUrl,
  lastReviewedOn: row.lastReviewedOn ? fromDateColumn(row.lastReviewedOn) : null,
  aiTraining: row.aiTrainingNote,
  dataLocation: row.storageLocationNote,
  installLimitMaxDevices: row.installLimitMaxDevices,
  installLimitNote: row.installLimitNote,
  commercialUse: row.commercialUseNote,
  cancellationRefund: row.cancellationRefundNote,
  updatedAt: row.updatedAt,
});

const columnsOf = (content: TermsContent) => ({
  termsUrl: content.termsUrl,
  lastReviewedOn: content.lastReviewedOn ? toDateColumn(content.lastReviewedOn) : null,
  aiTrainingNote: content.aiTraining,
  storageLocationNote: content.dataLocation,
  installLimitMaxDevices: content.installLimitMaxDevices,
  installLimitNote: content.installLimitNote,
  commercialUseNote: content.commercialUse,
  cancellationRefundNote: content.cancellationRefund,
});

/** The one writer of `plan_terms` (the opinions that were kept stay in `plan_term_opinions`, unread, `QĐ-111g`): what IT read in the terms of a plan. */
@Injectable()
export class PlanTermsRepo {
  constructor(private readonly prisma: PrismaService) {}

  async find(planId: string, tx?: DbTx): Promise<TermsRecord | null> {
    const row = await (tx ?? this.prisma).planTerms.findUnique({ where: { planId } });

    return row ? toTerms(row) : null;
  }

  /** Writes the whole terms of the plan: the columns not given are emptied. */
  async upsert(tx: DbTx, planId: string, content: TermsContent): Promise<TermsRecord> {
    const row = await tx.planTerms.upsert({
      where: { planId },
      create: { planId, ...columnsOf(content) },
      update: columnsOf(content),
    });

    return toTerms(row);
  }

  /** The date of the last review of each plan given; a plan with no terms is absent. */
  async lastReviews(planIds: readonly string[]): Promise<Map<string, BusinessDate | null>> {
    if (planIds.length === 0) return new Map();
    const rows = await this.prisma.planTerms.findMany({
      where: { planId: { in: [...planIds] } },
      select: { planId: true, lastReviewedOn: true },
    });

    return new Map(rows.map((row) => [row.planId, row.lastReviewedOn ? fromDateColumn(row.lastReviewedOn) : null]));
  }
}
