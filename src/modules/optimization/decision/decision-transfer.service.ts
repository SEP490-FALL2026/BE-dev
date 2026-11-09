import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
import { LicensingGhostSeatApi } from '../../licensing/public/licensing-ghost-seat.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelApi } from '../../personnel/public/personnel.api';
import type { TransferFact } from '../../personnel/public/personnel.types';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import { PAUSABLE_STATES } from '../ghost-seat/ghost-seat-state.policy';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { DecisionRoutingService } from './decision-routing.service';
import { isTransferOver, resumeStepOf } from './decision-routing.policy';
import type { FollowUpDay } from './decision.types';

const SYSTEM = { kind: 'SYSTEM' } as const;

/**
 * A holder in a transfer that has taken effect and is not closed has the recommendation about the seat paused (`QĐ-90c`, `US-10-06` AC-15):
 * nothing is asked of a head until the transfer is over. A reclaim already decided is not paused (`Q-89`, the task waits). When the transfer
 * is over the recommendation ends with the seat (`TRANSFER_SEAT_REVOKED`), goes to the head of the department the holder is in now with a new
 * due day counted from the day it enters the queue (`US-10-06` AC-16, AC-19), or, for the watch tier, goes back to open (`DA6-20`).
 */
@Injectable()
export class DecisionTransferService {
  private readonly logger = new Logger(DecisionTransferService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: GhostSeatRepo,
    private readonly ghostSeats: GhostSeatService,
    private readonly personnel: PersonnelApi,
    private readonly licensing: LicensingGhostSeatApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly routing: DecisionRoutingService,
  ) {}

  /** Pauses the recommendations nobody decided whose holder is in a transfer in overlap; returns how many. */
  async pause(day: FollowUpDay): Promise<number> {
    const candidates = (await this.repo.ofStates(day.organizationId, PAUSABLE_STATES)).filter(
      (record) => record.employeeId !== null,
    );
    const overlaps = await this.personnel.getTransfersInOverlap(
      [...new Set(candidates.flatMap((record) => record.employeeId ?? []))],
      day.today,
    );
    const byEmployee = new Map<string, TransferFact>();
    for (const transfer of overlaps)
      if (!byEmployee.has(transfer.employeeId)) byEmployee.set(transfer.employeeId, transfer);
    let paused = 0;
    for (const listed of candidates) {
      const transfer = byEmployee.get(listed.employeeId ?? '');
      if (!transfer) continue;
      try {
        if (await this.runner.run((tx) => this.pauseOne(tx, listed.id, transfer, day.now))) paused += 1;
      } catch (error) {
        this.logger.error(`Pausing ${listed.id} failed: ${describeForOperator(error)}`);
      }
    }

    return paused;
  }

  /**
   * Before a head decides: pauses, each in a transaction of its own, the recommendations whose holder is in a transfer that has taken effect
   * (the job may not have run since), so the decision that follows finds them `PAUSED` and answers 409 (`US-10-06` AC-15).
   */
  async pauseIfTransferred(ids: readonly string[], today: string, now: Date): Promise<void> {
    const records = (await this.repo.findMany(ids)).filter(
      (record) => record.employeeId !== null && PAUSABLE_STATES.includes(record.state),
    );
    const overlaps = await this.personnel.getTransfersInOverlap(
      [...new Set(records.flatMap((record) => record.employeeId ?? []))],
      today,
    );
    const byEmployee = new Map(overlaps.map((transfer) => [transfer.employeeId, transfer] as const));
    for (const record of records) {
      const transfer = byEmployee.get(record.employeeId ?? '');
      if (transfer) await this.runner.run((tx) => this.pauseOne(tx, record.id, transfer, now));
    }
  }

  /** Pauses one recommendation inside the transaction of the caller, locked first. */
  async pauseOne(tx: DbTx, id: string, transfer: TransferFact, now: Date): Promise<boolean> {
    const record = await this.repo.lockOrSkip(tx, id);
    if (!record || !PAUSABLE_STATES.includes(record.state)) return false;
    await this.ghostSeats.transition(
      tx,
      record,
      'PAUSED',
      { pausedAt: now, pauseTransferId: transfer.transferId },
      'GHOST_SEAT.PAUSED',
      SYSTEM,
      { transferId: transfer.transferId, toDepartmentId: transfer.toDepartmentId },
    );

    return true;
  }

  /** Looks at the paused ones whose transfer is over; returns how many it moved. */
  async resume(day: FollowUpDay): Promise<number> {
    const paused = (await this.repo.ofStates(day.organizationId, ['PAUSED'])).filter(
      (record) => record.pauseTransferId !== null && record.employeeId !== null,
    );
    if (paused.length === 0) return 0;
    const facts = new Map(
      (await this.personnel.getTransfersByIds(paused.flatMap((record) => record.pauseTransferId ?? []))).map(
        (transfer) => [transfer.transferId, transfer] as const,
      ),
    );
    const over = paused.filter((record) => {
      const transfer = facts.get(record.pauseTransferId ?? '');

      return transfer !== undefined && isTransferOver(transfer);
    });
    if (over.length === 0) return 0;
    const seats = await this.licensing.listSeatsForRules({
      asOf: day.today,
      employeeIds: [...new Set(over.flatMap((record) => record.employeeId ?? []))],
    });
    const openChains = new Set(seats.map((seat) => seat.chainRootId));
    let resumed = 0;
    for (const listed of over) {
      try {
        const done = await this.runner.run((tx) => this.resumeOne(tx, listed.id, openChains, day));
        if (done) resumed += 1;
      } catch (error) {
        this.logger.error(`Resuming ${listed.id} failed: ${describeForOperator(error)}`);
      }
    }

    return resumed;
  }

  private async resumeOne(tx: DbTx, id: string, openChains: ReadonlySet<string>, day: FollowUpDay): Promise<boolean> {
    const record = await this.repo.lockOrSkip(tx, id);
    if (!record || record.state !== 'PAUSED' || record.employeeId === null) return false;
    const step = resumeStepOf({
      transferOver: true,
      seatStillOpen: record.seatChainId !== null && openChains.has(record.seatChainId),
      tier: record.tier,
    });
    if (step.kind === 'SEAT_REVOKED') {
      await this.ghostSeats.close(tx, record, 'TRANSFER_SEAT_REVOKED', SYSTEM, day.now);

      return true;
    }
    if (step.kind === 'TO_OPEN') return this.backToOpen(tx, record);
    if (step.kind !== 'TO_QUEUE') return false;
    const placement = await this.organizationReads.getEmployeePlacement(record.employeeId, day.today, tx);
    if (!placement) return false;
    await this.routing.enterQueue(tx, record, day, {
      departmentId: placement.departmentId,
      returned: record.returnCount === 1,
      action: 'GHOST_SEAT.RESUMED',
      facts: {
        fromDepartmentId: record.deciderDepartmentId,
        toDepartmentId: placement.departmentId,
        transferId: record.pauseTransferId,
      },
    });

    return true;
  }

  private async backToOpen(tx: DbTx, record: GhostSeatRecord): Promise<boolean> {
    await this.ghostSeats.transition(
      tx,
      record,
      'OPEN',
      { routedAt: null, decisionDueOn: null, deciderDepartmentId: null, pausedAt: null, pauseTransferId: null },
      'GHOST_SEAT.RESUMED',
      SYSTEM,
      { transferId: record.pauseTransferId },
    );

    return true;
  }
}
