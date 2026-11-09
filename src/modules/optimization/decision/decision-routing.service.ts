import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { decisionDueOn, headWatchOf, isoWeekKeyOf, isRoutedTier, queueStateOf } from './decision-routing.policy';
import type { FollowUpDay } from './decision.types';

const SYSTEM = { kind: 'SYSTEM' } as const;
const SUBJECT = 'GHOST_SEAT_RECOMMENDATION';

/** How a recommendation enters the queue of a department: the audit code of the move, and what the event adds. */
export interface QueueEntry {
  departmentId: string;
  returned: boolean;
  /** The audit code when it is not the plain routing (`GHOST_SEAT.RESUMED` after a transfer). */
  action?: string;
  facts?: { [key: string]: string | null };
}

/**
 * Puts the recommendations of `G3`/`G4` in front of the head of the department of their holder (`FR-4.12`, `US-10-06` AC-1, AC-9, AC-16): a
 * recommendation of the review or action tier that was never routed goes to the queue of the head that department has today, or waits for
 * one (`QĐ-104h`: nobody else is given it); a queue whose department lost its head waits and one whose department has a head again goes
 * back to it, the due day never set again (`DA6-21`). Each recommendation is moved in a transaction of its own, taken `SKIP LOCKED`, and
 * the heads and the Super Admin are told once (the week, the day).
 */
@Injectable()
export class DecisionRoutingService {
  private readonly logger = new Logger(DecisionRoutingService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: GhostSeatRepo,
    private readonly ghostSeats: GhostSeatService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly notifications: NotificationsApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /** Routes every recommendation of the review or action tier that no head has been asked about; returns how many it moved. */
  async routeNew(day: FollowUpDay): Promise<number> {
    const open = (await this.repo.ofStates(day.organizationId, ['OPEN'])).filter(
      (record) => record.routedAt === null && isRoutedTier(record.tier),
    );
    let routed = 0;
    for (const listed of open) {
      try {
        const done = await this.runner.run(async (tx) => {
          const record = await this.repo.lockOrSkip(tx, listed.id);
          if (!record || record.state !== 'OPEN' || record.routedAt !== null || record.employeeId === null)
            return false;
          const placement = await this.organizationReads.getEmployeePlacement(record.employeeId, day.today, tx);
          if (!placement) return false;
          await this.enterQueue(tx, record, day, { departmentId: placement.departmentId, returned: false });

          return true;
        });
        if (done) routed += 1;
      } catch (error) {
        this.logger.error(`Routing ${listed.id} failed: ${describeForOperator(error)}`);
      }
    }

    return routed;
  }

  /** Moves a recommendation into the queue of a department and tells the head, or the Super Admin when there is none. */
  async enterQueue(
    tx: DbTx,
    record: GhostSeatRecord,
    day: FollowUpDay,
    entry: QueueEntry,
    dueOn = decisionDueOn(day.today, day.workingDays, day.nonWorking),
  ): Promise<GhostSeatRecord> {
    const head = (await this.organizationReads.getDepartmentHeads([entry.departmentId], day.today, tx)).get(
      entry.departmentId,
    );
    const to = queueStateOf(head !== undefined, entry.returned);
    const action = entry.action ?? (head ? 'GHOST_SEAT.ROUTED' : 'GHOST_SEAT.WAITING_FOR_HEAD');
    const updated = await this.ghostSeats.transition(
      tx,
      record,
      to,
      {
        deciderDepartmentId: entry.departmentId,
        routedAt: day.now,
        decisionDueOn: dueOn,
        // A recommendation that enters a queue again is new to it: its head is reminded and the IT Admin warned when it is overdue again.
        overdueNoticedAt: null,
        pausedAt: null,
        pauseTransferId: null,
      },
      action,
      SYSTEM,
      entry.facts ?? {},
    );
    await this.tellEntry(tx, updated, day, entry.departmentId, head?.employeeId ?? null);

    return updated;
  }

  /** A department that lost its head makes its queue wait, one that has a head again hands the waiting ones back (`DA6-21`). */
  async watchHeads(day: FollowUpDay): Promise<number> {
    const queued = (
      await this.repo.ofStates(day.organizationId, ['AWAITING_DECISION', 'RETURNED_TO_HEAD', 'WAITING_FOR_HEAD'])
    ).filter((record) => record.deciderDepartmentId !== null);
    const departmentIds = [...new Set(queued.flatMap((record) => record.deciderDepartmentId ?? []))];
    if (departmentIds.length === 0) return 0;
    let moved = 0;
    for (const listed of queued) {
      try {
        if (await this.runner.run((tx) => this.watch(tx, listed.id, day))) moved += 1;
      } catch (error) {
        this.logger.error(`Watching the head of ${listed.id} failed: ${describeForOperator(error)}`);
      }
    }

    return moved;
  }

  private async watch(tx: DbTx, id: string, day: FollowUpDay): Promise<boolean> {
    const record = await this.repo.lockOrSkip(tx, id);
    const departmentId = record?.deciderDepartmentId;
    if (!record || !departmentId) return false;
    const heads = await this.organizationReads.getDepartmentHeads([departmentId], day.today, tx);
    const head = heads.get(departmentId);
    const step = headWatchOf({ state: record.state, hasHead: head !== undefined, returnCount: record.returnCount });
    if (step.kind === 'KEEP') return false;
    if (step.kind === 'ASSIGN') {
      await this.ghostSeats.transition(tx, record, step.to, {}, 'GHOST_SEAT.HEAD_ASSIGNED', SYSTEM, {
        headEmployeeId: head?.employeeId ?? null,
      });

      return true;
    }
    await this.ghostSeats.transition(tx, record, 'WAITING_FOR_HEAD', {}, 'GHOST_SEAT.WAITING_FOR_HEAD', SYSTEM);
    await this.tellSuperAdmin(tx, record, day, departmentId);

    return true;
  }

  private async tellEntry(
    tx: DbTx,
    record: GhostSeatRecord,
    day: FollowUpDay,
    departmentId: string,
    headEmployeeId: string | null,
  ): Promise<void> {
    const weekKey = isoWeekKeyOf(day.today);
    const params = { recommendationId: record.id, departmentId, weekKey };
    if (headEmployeeId) {
      await this.notifications.notifyInApp(tx, {
        organizationId: day.organizationId,
        recipientEmployeeId: headEmployeeId,
        code: 'GHOST_SEAT_NEW',
        subject: { type: SUBJECT, id: record.id },
        params,
        eventKey: `GHOST_SEAT_NEW:${headEmployeeId}:${weekKey}`,
      });
    } else {
      await this.notifications.holdForDepartment(tx, {
        organizationId: day.organizationId,
        departmentId,
        code: 'GHOST_SEAT_NEW',
        subject: { type: SUBJECT, id: record.id },
        params,
        eventKey: `GHOST_SEAT_NEW:${departmentId}:${weekKey}`,
      });
      await this.tellSuperAdmin(tx, record, day, departmentId);
    }
    if (record.tier !== 'ACTION') return;
    const inCharge = await this.organizationReads.getItAdminInChargeOfDepartment(departmentId, tx);
    if (!inCharge) return;
    await this.notifications.notifyInApp(tx, {
      organizationId: day.organizationId,
      recipientEmployeeId: inCharge,
      code: 'GHOST_SEAT_ACTION_TIER',
      subject: { type: SUBJECT, id: record.id },
      params,
      eventKey: `GHOST_SEAT_ACTION_TIER:${inCharge}:${weekKey}`,
    });
  }

  /** The Super Admin is told once a day for a department that has nobody to decide (`US-10-06` AC-9). */
  async tellSuperAdmin(tx: DbTx, record: GhostSeatRecord, day: FollowUpDay, departmentId: string): Promise<void> {
    const superAdmin = await this.identity.findUsableSuperAdminEmployeeId(tx);
    if (!superAdmin) return;
    await this.notifications.notifyInApp(tx, {
      organizationId: day.organizationId,
      recipientEmployeeId: superAdmin,
      code: 'GHOST_SEAT_WAITING_FOR_HEAD',
      subject: { type: SUBJECT, id: record.id },
      params: { recommendationId: record.id, departmentId },
      eventKey: `GHOST_SEAT_WAITING_FOR_HEAD:${departmentId}:${day.today}`,
    });
  }
}
