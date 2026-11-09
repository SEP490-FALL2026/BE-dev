import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { SkipGate } from '../rule-run/rule-run.repo';

export type SeatStatus =
  'ACTIVE' | 'INACTIVE' | 'NO_DATA' | 'UNMATCHED_IDENTITY' | 'INSUFFICIENT_EVIDENCE' | 'EXCLUDED';

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

/** The state each seat chain has after the last weekly pass of `G3`/`G4` (`FR-5.10`): written by the pass, read by the board of the IT Admin. */
@Injectable()
export class GhostSeatSeatStateRepo {
  constructor(private readonly prisma: PrismaService) {}

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

  /** The state of every seat chain of the organization after the last pass, with the last day it showed activity: what `KPI-3` counts. */
  async statesOf(
    organizationId: string,
    tx?: DbTx,
  ): Promise<{ seatChainId: string; status: SeatStatus; lastActiveDate: BusinessDate | null }[]> {
    const rows = await (tx ?? this.prisma).ghostSeatSeatState.findMany({
      where: { organizationId },
      select: { seatChainId: true, status: true, lastActiveDate: true },
      orderBy: { seatChainId: 'asc' },
    });

    return rows.map((row) => ({
      seatChainId: row.seatChainId,
      status: row.status,
      lastActiveDate: row.lastActiveDate ? fromDateColumn(row.lastActiveDate) : null,
    }));
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
  async countByStatus(
    organizationId: string,
  ): Promise<Array<{ status: SeatStatus; gate: SkipGate | null; count: number }>> {
    const rows = await this.prisma.ghostSeatSeatState.groupBy({
      by: ['status', 'gate'],
      where: { organizationId },
      _count: { _all: true },
    });

    return rows.map((row) => ({ status: row.status, gate: row.gate, count: row._count._all }));
  }
}
