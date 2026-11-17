import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AdjustmentKind, AdjustmentState, TransferReason } from './budget-adjustment.types';

/** What Finance asks for. */
export interface NewAdjustment {
  organizationId: string;
  year: number;
  kind: AdjustmentKind;
  fromCostCenterId: string | null;
  toCostCenterId: string | null;
  amountMinor: bigint;
  currency: string;
  reason: string;
  transferReason: TransferReason | null;
  createdByEmployeeId: string;
  createdAt: Date;
}

export interface AdjustmentRecord extends NewAdjustment {
  id: string;
  state: AdjustmentState;
  decidedByEmployeeId: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  createdVersionId: string | null;
}

/** The decision of the spending approver, with the version the approval made for a Cost Center that had none (R-48). */
export interface AdjustmentDecision {
  state: 'APPROVED' | 'REJECTED';
  decidedByEmployeeId: string;
  decidedAt: Date;
  decisionReason: string | null;
  createdVersionId: string | null;
}

export interface AdjustmentFilter {
  organizationId: string;
  year?: number;
  state?: AdjustmentState;
  /** The adjustments that name one of these Cost Centers, as giver or receiver; the ones of the ceiling name none and are for Finance and the spending approver only. */
  costCenterIds?: readonly string[];
  skip: number;
  take: number;
}

const toRecord = (row: Prisma.BudgetAdjustmentGetPayload<object>): AdjustmentRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  year: row.year,
  kind: row.kind as AdjustmentKind,
  fromCostCenterId: row.fromCostCenterId,
  toCostCenterId: row.toCostCenterId,
  amountMinor: row.amountMinor,
  currency: row.currency,
  reason: row.reason,
  transferReason: row.transferReason as TransferReason | null,
  createdByEmployeeId: row.createdByEmployeeId,
  createdAt: row.createdAt,
  state: row.state as AdjustmentState,
  decidedByEmployeeId: row.decidedByEmployeeId,
  decidedAt: row.decidedAt,
  decisionReason: row.decisionReason,
  createdVersionId: row.createdVersionId,
});

/** All the SQL of the adjustments of the budget in the year (`AD-1`): what Finance asks for is written once and never edited, and is decided once. */
@Injectable()
export class BudgetAdjustmentRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewAdjustment): Promise<AdjustmentRecord> {
    const row = await tx.budgetAdjustment.create({
      data: { ...input, state: 'PENDING' },
    });

    return toRecord(row);
  }

  async findById(id: string, tx?: DbTx): Promise<AdjustmentRecord | null> {
    const row = await (tx ?? this.prisma).budgetAdjustment.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** The adjustment with its row locked until the transaction ends: what two decisions of one adjustment take turns on. */
  async lockById(tx: DbTx, id: string): Promise<AdjustmentRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM budget_adjustments WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.findById(id, tx);
  }

  /** Writes the decision of a pending adjustment; false when it was decided already (the database refuses a second change). */
  async decide(tx: DbTx, id: string, decision: AdjustmentDecision): Promise<boolean> {
    const done = await tx.budgetAdjustment.updateMany({
      where: { id, state: 'PENDING' },
      data: {
        state: decision.state,
        decidedByEmployeeId: decision.decidedByEmployeeId,
        decidedAt: decision.decidedAt,
        decisionReason: decision.decisionReason,
        createdVersionId: decision.createdVersionId,
      },
    });

    return done.count === 1;
  }

  /** One page, the latest asked first, and how many there are. */
  async page(filter: AdjustmentFilter): Promise<{ items: AdjustmentRecord[]; total: number }> {
    const where: Prisma.BudgetAdjustmentWhereInput = {
      organizationId: filter.organizationId,
      ...(filter.year === undefined ? {} : { year: filter.year }),
      ...(filter.state === undefined ? {} : { state: filter.state }),
      ...(filter.costCenterIds === undefined
        ? {}
        : {
            OR: [
              { fromCostCenterId: { in: [...filter.costCenterIds] } },
              { toCostCenterId: { in: [...filter.costCenterIds] } },
            ],
          }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.budgetAdjustment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.budgetAdjustment.count({ where }),
    ]);

    return { items: rows.map(toRecord), total };
  }
}
