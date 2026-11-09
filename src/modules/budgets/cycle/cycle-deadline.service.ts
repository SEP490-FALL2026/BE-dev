import { Injectable, Logger } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import type { InAppNotificationCode, InAppParamValue } from '../../notifications/public/notifications.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { ProposalRepo } from '../budget/proposal.repo';
import { VersionRepo } from '../budget/version.repo';
import { deadlineDuties } from './cycle-deadline.policy';
import { CycleRepo, type CycleRecord } from './cycle.repo';

/** What a pass of the deadlines wrote: how many notices were new (a notice written before is not written again). */
export interface DeadlineResult {
  notices: number;
}

/** The cycle being told, the transaction it is told in, the day, and the notices written so far. */
interface Pass {
  tx: DbTx;
  cycle: CycleRecord;
  today: BusinessDate;
  finance: string | null;
  /** Every department of the year, with the Cost Center in use of those that have one. */
  departmentIds: string[];
  costCenters: Map<string, string>;
  written: number;
}

/**
 * The reminders of the budget cycle (`R-I05`, `QĐ-108e`): past the submission deadline the head who has not proposed is told, Finance
 * and the Super Admin are told which departments nobody heads, and Finance how many have not proposed; past the decision deadline the
 * spending approver and Finance are told of the versions still waiting; while the deadline is ahead Finance is told, once for each
 * department, which have no Cost Center yet. Every notice carries the cycle and the day of the deadline in its event key, so a pass
 * that runs again writes nothing, and a deadline that Finance moves is told again for the new day. Reminders only: nothing is
 * decided or changed here.
 */
@Injectable()
export class CycleDeadlineService {
  private readonly logger = new Logger(CycleDeadlineService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly facts: BudgetFactsService,
    private readonly cycles: CycleRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly proposals: ProposalRepo,
    private readonly versions: VersionRepo,
    private readonly notifications: NotificationsApi,
  ) {}

  /** One pass over the cycles of this year and the years to come; each cycle in a transaction of its own. */
  async run(now: Date = new Date()): Promise<DeadlineResult> {
    const today = await this.facts.today(now);
    const organizationId = await this.facts.organizationId();
    const cycles = await this.cycles.upcomingOf(organizationId, Number(today.slice(0, 4)));
    let notices = 0;
    for (const cycle of cycles) {
      // A cycle that fails does not stop the ones after it: each has a transaction of its own and is told again in the next pass.
      try {
        notices += await this.runner.run((tx) => this.remind(tx, cycle, today));
      } catch (error) {
        this.logger.error(
          `Budget deadlines of cycle ${cycle.id} (${cycle.year}) failed: ${describeForOperator(error)}`,
          traceForOperator(error),
        );
      }
    }

    return { notices };
  }

  private async remind(tx: DbTx, cycle: CycleRecord, today: BusinessDate): Promise<number> {
    const duties = deadlineDuties({
      today,
      submissionDeadline: cycle.submissionDeadline,
      decisionDeadline: cycle.decisionDeadline,
      publishedOnce: cycle.firstPublishedAt !== null,
    });
    const departmentIds = await this.organizationReads.getActiveDepartmentIds(cycle.year, tx);
    const pass: Pass = {
      tx,
      cycle,
      today,
      finance: await this.facts.financeEmployeeId(tx),
      departmentIds,
      costCenters: await this.organizationReads.getUnitCostCenterIds(departmentIds, tx),
      written: 0,
    };
    if (duties.costCenterSetup) await this.tellCostCenterSetup(pass);
    if (duties.submissionPassed) await this.tellSubmissionPassed(pass);
    if (duties.decisionPassed) await this.tellDecisionPassed(pass);

    return pass.written;
  }

  /** Finance is told, once for each department, which have no Cost Center in use yet (`QĐ-108e`). */
  private async tellCostCenterSetup(pass: Pass): Promise<void> {
    for (const departmentId of pass.departmentIds.filter((id) => !pass.costCenters.has(id)))
      await this.send(pass, pass.finance, 'BUDGET_COST_CENTER_SETUP_DUE', departmentId, { departmentId });
  }

  /** The deadline of the submissions has passed: the heads who have not proposed, Finance, and the departments nobody heads. */
  private async tellSubmissionPassed(pass: Pass): Promise<void> {
    const { tx, cycle, today } = pass;
    const proposed = await this.proposals.proposedCostCenters([...pass.costCenters.values()], cycle.year, tx);
    const missing = pass.departmentIds.filter((id) => !proposed.has(pass.costCenters.get(id) ?? ''));
    const noHead: string[] = [];
    
    // C4-09: Lấy danh sách Cost Center đã có phiên bản (DRAFT/SENT/CHANGES_REQUESTED/APPROVED) của năm kỳ
    const versionedCostCenters = await tx.budgetVersion.findMany({
      where: { organizationId: cycle.organizationId, year: cycle.year, state: { in: ['DRAFT', 'SENT', 'CHANGES_REQUESTED', 'APPROVED'] }, detachedAt: null },
      select: { costCenterId: true },
      distinct: ['costCenterId'],
    });
    const versionedCostCenterIds = new Set(versionedCostCenters.map((v) => v.costCenterId));
    
    // The heads of all the departments in one read; only a department with none asks who is to head it (a successor).
    const heads = await this.organizationReads.getDepartmentHeads(missing, today, tx);
    for (const departmentId of missing) {
      const costCenterId = pass.costCenters.get(departmentId);
      const head =
        heads.get(departmentId)?.employeeId ??
        (await this.organizationReads.getUpcomingHeadOf(departmentId, today, tx));
      if (head !== null && head !== undefined && costCenterId !== undefined) {
        await this.send(
          pass,
          head,
          'BUDGET_PROPOSAL_DEADLINE_REMINDER',
          `${cycle.submissionDeadline}:${costCenterId}`,
          {
            costCenterId,
            submissionDeadline: cycle.submissionDeadline,
          },
        );
      } else if (!head && !(await this.organizationReads.hasHeadStartingAfter(departmentId, today, tx)) && costCenterId && !versionedCostCenterIds.has(costCenterId)) {
        // C4-09: Chỉ báo nếu phòm không có phiên bản nào
        noHead.push(departmentId);
      }
    }
    const day = cycle.submissionDeadline;
    if (missing.length > 0)
      await this.send(pass, pass.finance, 'BUDGET_SUBMISSION_DEADLINE_PASSED', day, {
        departmentCount: missing.length,
        submissionDeadline: day,
      });
    // Finance and the Super Admin are told which departments nobody heads, one notice for each (the department is what Finance builds from).
    const superAdmin = await this.facts.superAdminEmployeeId(tx);
    for (const departmentId of noHead) {
      const params = { departmentId, submissionDeadline: day };
      await this.send(pass, pass.finance, 'BUDGET_NO_HEAD_AT_DEADLINE', `${day}:${departmentId}`, params);
      await this.send(pass, superAdmin, 'BUDGET_NO_HEAD_AT_DEADLINE', `${day}:${departmentId}`, params);
    }
  }

  /** The deadline of the decisions has passed: the spending approver and Finance are told of the versions still waiting. */
  private async tellDecisionPassed(pass: Pass): Promise<void> {
    const { tx, cycle } = pass;
    const waiting = await this.versions.countSentOfYear(cycle.organizationId, cycle.year, tx);
    if (waiting === 0) return;
    const params = { versionCount: waiting, decisionDeadline: cycle.decisionDeadline };
    const approver = await this.facts.usableSpendingApproverEmployeeId(tx);
    await this.send(pass, approver, 'BUDGET_DECISION_DEADLINE_REMINDER', cycle.decisionDeadline, params);
    await this.send(pass, pass.finance, 'BUDGET_DECISION_DEADLINE_REMINDER', cycle.decisionDeadline, params);
  }

  private async send(
    pass: Pass,
    recipient: string | null,
    code: InAppNotificationCode,
    key: string,
    params: Record<string, InAppParamValue>,
  ): Promise<void> {
    if (recipient === null) return;
    const isNew = await this.notifications.notifyInApp(pass.tx, {
      organizationId: pass.cycle.organizationId,
      recipientEmployeeId: recipient,
      code,
      subject: { type: 'BUDGET_CYCLE', id: pass.cycle.id },
      params: { cycleId: pass.cycle.id, year: pass.cycle.year, ...params },
      eventKey: `${code}:${pass.cycle.id}:${key}`,
    });
    if (isNew) pass.written += 1;
  }
}
