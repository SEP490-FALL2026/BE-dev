import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

export type DecisionKind = 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

export interface DecisionRecord {
  decision: DecisionKind;
  decidedByEmployeeId: string;
  reason: string | null;
  totalMinor: bigint;
  previousTotalMinor: bigint | null;
  currency: string;
  decidedAt: Date;
}

export interface NewDecision extends DecisionRecord {
  organizationId: string;
  versionId: string;
  /** Who decided: the approver, or the substitute when the approver was a party (`US-06-08` AC-11). */
  deciderRole: 'SPENDING_APPROVER' | 'CONFLICT_SUBSTITUTE';
}

/** The one writer of `budget_version_decisions`: the record of a decision, which is written once and never changed. */
@Injectable()
export class DecisionRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewDecision): Promise<void> {
    await tx.budgetVersionDecision.create({
      data: {
        organizationId: input.organizationId,
        versionId: input.versionId,
        decision: input.decision,
        decidedByEmployeeId: input.decidedByEmployeeId,
        deciderRole: input.deciderRole,
        reason: input.reason,
        totalMinor: input.totalMinor,
        previousTotalMinor: input.previousTotalMinor,
        currency: input.currency,
        decidedAt: input.decidedAt,
      },
    });
  }

  /** The latest decision of each of these versions; a version nobody has decided is absent. */
  async latestOf(versionIds: readonly string[]): Promise<Map<string, DecisionRecord>> {
    if (versionIds.length === 0) return new Map();
    const rows = await this.prisma.budgetVersionDecision.findMany({
      where: { versionId: { in: [...versionIds] } },
      orderBy: [{ decidedAt: 'desc' }, { id: 'asc' }],
    });
    const latest = new Map<string, DecisionRecord>();
    for (const row of rows) {
      if (latest.has(row.versionId)) continue;
      latest.set(row.versionId, {
        decision: row.decision,
        decidedByEmployeeId: row.decidedByEmployeeId,
        reason: row.reason,
        totalMinor: row.totalMinor,
        previousTotalMinor: row.previousTotalMinor,
        currency: row.currency,
        decidedAt: row.decidedAt,
      });
    }

    return latest;
  }
}
