import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

export interface ReserveConfirmationRecord {
  id: string;
  requestId: string;
  checkId: string;
  spendStepId: string;
  reason: string;
  confirmedByEmployeeId: string;
  confirmedAt: Date;
}

export interface NewReserveConfirmation {
  organizationId: string;
  requestId: string;
  checkId: string;
  spendStepId: string;
  reason: string;
  confirmedByEmployeeId: string;
  confirmedAt: Date;
}

const toRecord = (row: ReserveConfirmationRecord): ReserveConfirmationRecord => ({
  id: row.id,
  requestId: row.requestId,
  checkId: row.checkId,
  spendStepId: row.spendStepId,
  reason: row.reason,
  confirmedByEmployeeId: row.confirmedByEmployeeId,
  confirmedAt: row.confirmedAt,
});

/**
 * The one writer of `request_reserve_confirmations` (`BR-MF1-06h`), and its reads. A confirmation is kept for the check it was given on
 * and the one spend step it opened; the database keeps it as written (`INV-05`) and refuses a second for the same check or step.
 */
@Injectable()
export class ReserveConfirmationRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewReserveConfirmation): Promise<ReserveConfirmationRecord> {
    return toRecord(await tx.requestReserveConfirmation.create({ data: input }));
  }

  /** The confirmation that opened the spend step, if the step has one: a step opened within the base has none. */
  async ofStep(spendStepId: string, tx?: DbTx): Promise<ReserveConfirmationRecord | null> {
    const row = await (tx ?? this.prisma).requestReserveConfirmation.findUnique({ where: { spendStepId } });

    return row ? toRecord(row) : null;
  }

  /** The confirmation of each of the steps, in one read. */
  async ofSteps(spendStepIds: readonly string[], tx?: DbTx): Promise<Map<string, ReserveConfirmationRecord>> {
    if (spendStepIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).requestReserveConfirmation.findMany({
      where: { spendStepId: { in: [...spendStepIds] } },
    });

    return new Map(rows.map((row) => [row.spendStepId, toRecord(row)]));
  }
}
