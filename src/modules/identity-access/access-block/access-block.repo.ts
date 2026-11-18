import { Injectable } from '@nestjs/common';
import { type BusinessDate, fromDateColumn, toDateColumn } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AccessBlockCause, AccessBlockRecord } from '../public/identity-access.types';

/** Owns `employee_access_blocks`: from which day an employee is refused (QĐ-100q), one row for each employee. */
@Injectable()
export class AccessBlockRepo {
  constructor(private readonly prisma: PrismaService) {}

  async find(employeeId: string, tx?: DbTx): Promise<AccessBlockRecord | null> {
    const row = await (tx ?? this.prisma).employeeAccessBlock.findUnique({
      where: { employeeId },
      select: { blockedFrom: true, cause: true, releasable: true, sourceCaseId: true },
    });

    return row
      ? {
          blockedFrom: fromDateColumn(row.blockedFrom),
          cause: row.cause as AccessBlockCause,
          releasable: row.releasable,
          sourceCaseId: row.sourceCaseId,
        }
      : null;
  }

  async findMany(employeeIds: readonly string[], tx?: DbTx): Promise<Map<string, AccessBlockRecord>> {
    if (employeeIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).employeeAccessBlock.findMany({
      where: { employeeId: { in: [...new Set(employeeIds)] } },
      select: { employeeId: true, blockedFrom: true, cause: true, releasable: true, sourceCaseId: true },
    });

    return new Map(
      rows.map((row) => [
        row.employeeId,
        {
          blockedFrom: fromDateColumn(row.blockedFrom),
          cause: row.cause as AccessBlockCause,
          releasable: row.releasable,
          sourceCaseId: row.sourceCaseId,
        },
      ]),
    );
  }

  async upsert(
    tx: DbTx,
    input: {
      employeeId: string;
      organizationId: string;
      cause: AccessBlockCause;
      blockedFrom: BusinessDate;
      caseId: string | null;
    },
  ): Promise<void> {
    const data = {
      cause: input.cause,
      blockedFrom: toDateColumn(input.blockedFrom),
      sourceCaseId: input.caseId,
      releasable: false,
      updatedAt: new Date(),
    };
    await tx.employeeAccessBlock.upsert({
      where: { employeeId: input.employeeId },
      create: { employeeId: input.employeeId, organizationId: input.organizationId, ...data },
      update: data,
    });
  }

  /** Moves the day of a block that follows the last working day; a block of another cause is not touched. */
  async moveLastDayBlock(tx: DbTx, employeeId: string, blockedFrom: BusinessDate): Promise<boolean> {
    const result = await tx.employeeAccessBlock.updateMany({
      where: { employeeId, cause: 'DEPARTURE_LAST_DAY' },
      data: { blockedFrom: toDateColumn(blockedFrom), updatedAt: new Date() },
    });

    return result.count === 1;
  }

  async delete(tx: DbTx, employeeId: string): Promise<void> {
    await tx.employeeAccessBlock.deleteMany({ where: { employeeId } });
  }

  async markReleasable(tx: DbTx, employeeId: string): Promise<void> {
    await tx.employeeAccessBlock.updateMany({
      where: { employeeId },
      data: { releasable: true, updatedAt: new Date() },
    });
  }
}
