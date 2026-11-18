import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { toDateColumn, type BusinessDate } from '../../../core/business-date';

export type RejectionReason =
  | 'NOT_ACKNOWLEDGED'
  | 'COLLECTION_STOPPED'
  | 'TOOL_STATUS_NOT_ACKNOWLEDGED'
  | 'OUTSIDE_WINDOW'
  | 'NOT_IN_ALLOWLIST'
  | 'FUTURE_GENERATED_AT'
  | 'FUTURE_OBSERVED_AT'
  | 'INVALID_COVERAGE'
  | 'INVALID_QUOTA';

export interface NewRejection {
  organizationId: string;
  deviceId: string;
  registrationId: string | null;
  credentialId: string;
  endpoint: 'AI_USAGE_BATCH' | 'AI_TOOL_STATUS_SNAPSHOT';
  usageDate: BusinessDate | null;
  reasonCode: RejectionReason;
}

export interface RejectionRow {
  id: string;
  endpoint: 'AI_USAGE_BATCH' | 'AI_TOOL_STATUS_SNAPSHOT';
  usageDate: Date | null;
  reasonCode: RejectionReason;
  rejectedAt: Date;
}

/** Why data was refused, one row for each refused day or snapshot: what the IT Admin reads to see why a machine is quiet. */
@Injectable()
export class IntakeRejectionRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insertMany(tx: DbTx, rows: readonly NewRejection[]): Promise<void> {
    if (rows.length === 0) return;
    await tx.intakeRejection.createMany({
      data: rows.map((row) => ({ ...row, usageDate: row.usageDate ? toDateColumn(row.usageDate) : null })),
    });
  }

  /** A page of the refusals of one machine, newest first, with the total of the same snapshot. */
  async pageOfDevice(
    deviceId: string,
    reasonCode: RejectionReason | undefined,
    skip: number,
    take: number,
  ): Promise<{ rows: RejectionRow[]; total: number }> {
    const where = { deviceId, ...(reasonCode ? { reasonCode } : {}) };

    return this.prisma.$transaction(
      async (tx) => ({
        rows: await tx.intakeRejection.findMany({
          where,
          orderBy: [{ rejectedAt: 'desc' }, { id: 'asc' }],
          skip,
          take,
          select: { id: true, endpoint: true, usageDate: true, reasonCode: true, rejectedAt: true },
        }),
        total: await tx.intakeRejection.count({ where }),
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
