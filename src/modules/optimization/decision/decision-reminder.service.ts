import { Injectable, Logger } from '@nestjs/common';
import { isWorkingDay } from '../../../core/working-days';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { GhostSeatDecisionRepo, type GhostSeatExemptionRecord } from '../ghost-seat/ghost-seat-decision.repo';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { DecisionRoutingService } from './decision-routing.service';
import type { FollowUpDay } from './decision.types';

const SYSTEM = { kind: 'SYSTEM' } as const;
const SUBJECT = 'GHOST_SEAT_RECOMMENDATION';

/**
 * What the head and the IT Admin are told while the queue waits and while an exemption runs out (`US-10-06` AC-14, `US-10-08` AC-1, AC-6,
 * AC-7): a decision past its due day is told once, on a working day, to the head and to the IT Admin in charge, and changes nothing (the
 * system never decides for the head, `QĐ-66t`); an exemption that ends within a week is told once to the head of the department the holder
 * is in now, or kept for the department when it has none; one that is over is marked ended, so the rules judge the seat again.
 */
@Injectable()
export class DecisionReminderService {
  private readonly logger = new Logger(DecisionReminderService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: GhostSeatRepo,
    private readonly decisions: GhostSeatDecisionRepo,
    private readonly ghostSeats: GhostSeatService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly notifications: NotificationsApi,
    private readonly routing: DecisionRoutingService,
  ) {}

  /** Tells what is overdue (on a working day only); returns how many recommendations were told. */
  async noticeOverdue(day: FollowUpDay): Promise<number> {
    if (!isWorkingDay(day.today, day.nonWorking)) return 0;
    const overdue = (await this.repo.ofStates(day.organizationId, ['AWAITING_DECISION', 'RETURNED_TO_HEAD'])).filter(
      (record) => record.decisionDueOn !== null && record.decisionDueOn < day.today && record.overdueNoticedAt === null,
    );
    let told = 0;
    for (const listed of overdue) {
      try {
        if (await this.runner.run((tx) => this.noticeOne(tx, listed.id, day))) told += 1;
      } catch (error) {
        this.logger.error(`Overdue notice of ${listed.id} failed: ${describeForOperator(error)}`);
      }
    }

    return told;
  }

  private async noticeOne(tx: DbTx, id: string, day: FollowUpDay): Promise<boolean> {
    const record = await this.repo.lockOrSkip(tx, id);
    const departmentId = record?.deciderDepartmentId;
    if (!record || !departmentId || record.overdueNoticedAt !== null || !record.decisionDueOn) return false;
    if (record.state !== 'AWAITING_DECISION' && record.state !== 'RETURNED_TO_HEAD') return false;
    const head = (await this.organizationReads.getDepartmentHeads([departmentId], day.today, tx)).get(departmentId);
    const inCharge = await this.organizationReads.getItAdminInChargeOfDepartment(departmentId, tx);
    const params = {
      recommendationId: record.id,
      employeeId: record.employeeId ?? '',
      applicationId: record.applicationId,
      decisionDueOn: record.decisionDueOn,
    };
    for (const recipient of new Set([head?.employeeId, inCharge])) {
      if (!recipient) continue;
      await this.notifications.notifyInApp(tx, {
        organizationId: day.organizationId,
        recipientEmployeeId: recipient,
        code: 'GHOST_SEAT_DECISION_OVERDUE',
        subject: { type: SUBJECT, id: record.id },
        params,
        eventKey: `GHOST_SEAT_DECISION_OVERDUE:${recipient}:${record.id}`,
      });
    }
    await this.ghostSeats.markOverdueNoticed(tx, record, day.now, SYSTEM);

    return true;
  }

  /** Ends the exemptions that are over, then tells the ones about to end; returns how many it told. */
  async remindExemptions(day: FollowUpDay): Promise<number> {
    await this.decisions.endExpired(day.organizationId, day.today, day.now);
    let told = 0;
    for (const exemption of await this.decisions.exemptionsToRemind(day.organizationId, day.today)) {
      try {
        if (await this.runner.run((tx) => this.remindOne(tx, exemption, day))) told += 1;
      } catch (error) {
        this.logger.error(`Exemption reminder ${exemption.id} failed: ${describeForOperator(error)}`);
      }
    }

    return told;
  }

  private async remindOne(tx: DbTx, exemption: GhostSeatExemptionRecord, day: FollowUpDay): Promise<boolean> {
    const record = await this.repo.find(exemption.recommendationId, tx);
    if (!record || record.employeeId === null) return false;
    const placement = await this.organizationReads.getEmployeePlacement(record.employeeId, day.today, tx);
    if (!placement) return false;
    const head = (await this.organizationReads.getDepartmentHeads([placement.departmentId], day.today, tx)).get(
      placement.departmentId,
    );
    await this.tellEnding(tx, record, exemption, day, {
      departmentId: placement.departmentId,
      headEmployeeId: head?.employeeId ?? null,
    });
    await this.decisions.markReminded(tx, exemption.id, day.now);
    await this.ghostSeats.note(tx, record, 'GHOST_SEAT.EXEMPTION_REMINDED', SYSTEM, {
      exemptUntil: exemption.exemptUntil,
    });

    return true;
  }

  private async tellEnding(
    tx: DbTx,
    record: GhostSeatRecord,
    exemption: GhostSeatExemptionRecord,
    day: FollowUpDay,
    to: { departmentId: string; headEmployeeId: string | null },
  ): Promise<void> {
    const input = {
      organizationId: day.organizationId,
      code: 'GHOST_SEAT_EXEMPTION_ENDING' as const,
      subject: { type: SUBJECT, id: record.id },
      params: {
        recommendationId: record.id,
        employeeId: record.employeeId ?? '',
        applicationId: record.applicationId,
        exemptUntil: exemption.exemptUntil,
      },
      eventKey: `GHOST_SEAT_EXEMPTION_ENDING:${exemption.id}`,
    };
    if (to.headEmployeeId) {
      await this.notifications.notifyInApp(tx, { ...input, recipientEmployeeId: to.headEmployeeId });

      return;
    }
    await this.notifications.holdForDepartment(tx, { ...input, departmentId: to.departmentId });
    await this.routing.tellSuperAdmin(tx, record, day, to.departmentId);
  }
}
