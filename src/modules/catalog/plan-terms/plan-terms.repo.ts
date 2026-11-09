import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { OpinionRecord, TermsContent, TermsRecord } from './plan-terms.types';

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

/** The one writer of `plan_terms` and `plan_term_opinions`: what IT read in the terms of a plan, and the opinions on it. */
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

  async insertOpinion(
    tx: DbTx,
    input: { planId: string; businessOwnerEmployeeId: string; opinion: string; recordedByAppUserId: string },
  ): Promise<OpinionRecord> {
    return tx.planTermOpinion.create({ data: input });
  }

  /** One page of the opinions on a plan, newest first, and the total, from one snapshot. */
  listOpinions(planId: string, skip: number, take: number): Promise<{ items: OpinionRecord[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => ({
        items: await tx.planTermOpinion.findMany({
          where: { planId },
          orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
        }),
        total: await tx.planTermOpinion.count({ where: { planId } }),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
