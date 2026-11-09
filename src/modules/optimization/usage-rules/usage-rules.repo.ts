import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { SeatStatus } from './usage-gates.policy';
import type { SkipGate } from '../rule-run/rule-run.repo';

export interface ApplicationThresholdRecord {
  organizationId: string;
  applicationId: string;
  monitorDays: number;
  reviewDays: number;
  actionDays: number;
  updatedByAppUserId: string;
  updatedAt: Date;
}

export interface SeatStateRecord {
  seatChainId: string;
  organizationId: string;
  applicationId: string;
  assignmentId: string;
  employeeId: string;
  status: SeatStatus;
  lastActiveDate: BusinessDate | null;
  inactiveDays: number | null;
  gate: SkipGate | null;
  assessedRunId: string;
  assessedOn: BusinessDate;
}

export type NewSeatState = SeatStateRecord;

/** The SQL of the weekly pass of `G3`/`G4` that is not about the recommendations: the thresholds of the applications and what the pass found of each seat. */
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

  listThresholds(organizationId: string, tx?: DbTx): Promise<ApplicationThresholdRecord[]> {
    return (tx ?? this.prisma).ghostSeatApplicationThreshold.findMany({
      where: { organizationId },
      orderBy: { applicationId: 'asc' },
    });
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

  async saveSeatState(tx: DbTx, state: NewSeatState): Promise<void> {
    const data = {
      organizationId: state.organizationId,
      applicationId: state.applicationId,
      assignmentId: state.assignmentId,
      employeeId: state.employeeId,
      status: state.status,
      lastActiveDate: state.lastActiveDate ? toDateColumn(state.lastActiveDate) : null,
      inactiveDays: state.inactiveDays,
      gate: state.gate,
      assessedRunId: state.assessedRunId,
      assessedOn: toDateColumn(state.assessedOn),
    };
    await tx.ghostSeatSeatState.upsert({
      where: { seatChainId: state.seatChainId },
      create: { seatChainId: state.seatChainId, ...data },
      update: data,
    });
  }

  /** The seats that held a seat at the last pass and do not now: their state is gone with the seat. */
  async deleteStaleSeatStates(organizationId: string, keepChainIds: readonly string[]): Promise<number> {
    const done = await this.prisma.ghostSeatSeatState.deleteMany({
      where: { organizationId, seatChainId: { notIn: [...keepChainIds] } },
    });

    return done.count;
  }

  async seatStatePage(
    organizationId: string,
    filter: { applicationId?: string; status?: SeatStatus },
    page: { skip: number; take: number },
  ): Promise<{ items: SeatStateRecord[]; total: number }> {
    const where = {
      organizationId,
      ...(filter.applicationId ? { applicationId: filter.applicationId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };
    const rows = await this.prisma.ghostSeatSeatState.findMany({
      where,
      orderBy: [{ applicationId: 'asc' }, { employeeId: 'asc' }, { seatChainId: 'asc' }],
      skip: page.skip,
      take: page.take,
    });
    const total = await this.prisma.ghostSeatSeatState.count({ where });

    return {
      items: rows.map((row) => ({
        seatChainId: row.seatChainId,
        organizationId: row.organizationId,
        applicationId: row.applicationId,
        assignmentId: row.assignmentId,
        employeeId: row.employeeId,
        status: row.status,
        lastActiveDate: row.lastActiveDate ? fromDateColumn(row.lastActiveDate) : null,
        inactiveDays: row.inactiveDays,
        gate: row.gate,
        assessedRunId: row.assessedRunId,
        assessedOn: fromDateColumn(row.assessedOn),
      })),
      total,
    };
  }

  /** How many seats each application has in each status after the last pass: the summary of the board. */
  async countByApplicationAndStatus(
    organizationId: string,
  ): Promise<Array<{ applicationId: string; status: SeatStatus; count: number }>> {
    const rows = await this.prisma.ghostSeatSeatState.groupBy({
      by: ['applicationId', 'status'],
      where: { organizationId },
      _count: { _all: true },
    });

    return rows.map((row) => ({ applicationId: row.applicationId, status: row.status, count: row._count._all }));
  }
}
