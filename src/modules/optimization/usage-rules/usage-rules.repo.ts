import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

export interface ApplicationThresholdRecord {
  organizationId: string;
  applicationId: string;
  monitorDays: number;
  reviewDays: number;
  actionDays: number;
  updatedByAppUserId: string;
  updatedAt: Date;
}

/** The SQL of the thresholds of days without use of an application (`FR-4.13`). */
@Injectable()
export class UsageRulesRepo {
  constructor(private readonly prisma: PrismaService) {}

  async thresholdsOf(applicationIds: readonly string[], tx?: DbTx): Promise<Map<string, ApplicationThresholdRecord>> {
    if (applicationIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).ghostSeatApplicationThreshold.findMany({
      where: { applicationId: { in: [...applicationIds] } },
    });

    return new Map(rows.map((row) => [row.applicationId, row]));
  }

  async listThresholds(
    organizationId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: ApplicationThresholdRecord[]; total: number }> {
    const db = tx ?? this.prisma;
    const items = await db.ghostSeatApplicationThreshold.findMany({
      where: { organizationId },
      orderBy: { applicationId: 'asc' },
      skip: page.skip,
      take: page.take,
    });

    return { items, total: await db.ghostSeatApplicationThreshold.count({ where: { organizationId } }) };
  }

  upsertThreshold(
    tx: DbTx,
    input: Omit<ApplicationThresholdRecord, 'updatedAt'>,
    at: Date,
  ): Promise<ApplicationThresholdRecord> {
    const data = {
      monitorDays: input.monitorDays,
      reviewDays: input.reviewDays,
      actionDays: input.actionDays,
      updatedByAppUserId: input.updatedByAppUserId,
      updatedAt: at,
    };

    return tx.ghostSeatApplicationThreshold.upsert({
      where: { applicationId: input.applicationId },
      create: { organizationId: input.organizationId, applicationId: input.applicationId, ...data },
      update: data,
    });
  }

  async deleteThreshold(tx: DbTx, applicationId: string): Promise<ApplicationThresholdRecord | null> {
    const found = await tx.ghostSeatApplicationThreshold.findUnique({ where: { applicationId } });
    if (!found) return null;
    await tx.ghostSeatApplicationThreshold.delete({ where: { applicationId } });

    return found;
  }
}
