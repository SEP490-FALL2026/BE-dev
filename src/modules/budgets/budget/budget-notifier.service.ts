import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import type { InAppNotificationCode, InAppParamValue } from '../../notifications/public/notifications.types';
import { deciderOf } from './budget.policy';
import { BudgetFactsService } from './budget-facts.service';
import type { ProposalRecord } from './proposal.repo';
import type { VersionRecord } from './version.repo';

interface Notice {
  organizationId: string;
  code: InAppNotificationCode;
  subject: { type: 'BUDGET_PROPOSAL' | 'BUDGET_VERSION' | 'BUDGET_CYCLE'; id: string };
  params: Record<string, InAppParamValue>;
  eventKey: string;
}

/**
 * The notices of the budget loops of a Cost Center and a year that this context gives (`QĐ-92b`, `US-12-15` rows 18, 40, 52 →
 * 55): the version that waits for the spending approver, a proposal sent or given back, a version decided, a version that never
 * became current and a proposal that is closed when the year ends, and the work of a proposal that falls to the head of today
 * or waits because nobody heads the department. Each is written in the transaction of the change that makes it, for the people
 * the role holders are at that moment, once for each event; none says a figure of money (the parameters are ids, the year, the
 * decision and the reason the person already reads). The notices of requests are the work of the context of requests.
 */
@Injectable()
export class BudgetNotifierService {
  constructor(
    private readonly notifications: NotificationsApi,
    private readonly facts: BudgetFactsService,
  ) {}

  /** A proposal was sent, or sent again: Finance is told (row 40). */
  async proposalSubmitted(tx: DbTx, proposal: ProposalRecord): Promise<void> {
    await this.tell(tx, await this.facts.financeEmployeeId(tx), {
      organizationId: proposal.organizationId,
      code: 'BUDGET_PROPOSAL_SUBMITTED',
      subject: { type: 'BUDGET_PROPOSAL', id: proposal.id },
      params: { proposalId: proposal.id, costCenterId: proposal.costCenterId, year: proposal.year },
      eventKey: `BUDGET_PROPOSAL_SUBMITTED:${proposal.id}`,
    });
  }

  /**
   * Finance gave the proposal back (rows 40, 54, 55). The head who sent it hears the reason. When that person no longer heads the
   * department, the head of today is given the work to send it again (row 54). When nobody heads it, the work waits: Finance is
   * told (row 55, nobody else: the Super Admin already has the notice of a department without a head) and the notice for the head is
   * kept for the first head the Super Admin names.
   */
  async proposalReturned(tx: DbTx, proposal: ProposalRecord, today: BusinessDate): Promise<void> {
    const departmentId = (await this.facts.departmentsOf([proposal.costCenterId], tx)).get(proposal.costCenterId);
    if (departmentId === undefined) return;
    // Locked before the head is read: a notice kept for a department that gets a head meanwhile would be left undelivered (T-11).
    const head = await this.facts.currentHeadOfLocked(departmentId, today, tx);
    const subject = { type: 'BUDGET_PROPOSAL', id: proposal.id } as const;
    const assigned: Notice = {
      organizationId: proposal.organizationId,
      code: 'BUDGET_PROPOSAL_TASK_ASSIGNED',
      subject,
      params: { costCenterId: proposal.costCenterId, departmentId, year: proposal.year },
      eventKey: `BUDGET_PROPOSAL_TASK_ASSIGNED:${proposal.id}`,
    };

    if (head !== null && head === proposal.submittedByEmployeeId) {
      await this.tell(tx, head, {
        organizationId: proposal.organizationId,
        code: 'BUDGET_PROPOSAL_RETURNED',
        subject,
        params: {
          proposalId: proposal.id,
          costCenterId: proposal.costCenterId,
          year: proposal.year,
          reason: proposal.returnedReason,
        },
        eventKey: `BUDGET_PROPOSAL_RETURNED:${proposal.id}`,
      });
    } else if (head !== null) {
      await this.tell(tx, head, assigned);
    } else {
      await this.tell(tx, await this.facts.financeEmployeeId(tx), {
        organizationId: proposal.organizationId,
        code: 'BUDGET_PROPOSAL_TASK_WAITING',
        subject,
        params: { proposalId: proposal.id, costCenterId: proposal.costCenterId, year: proposal.year },
        eventKey: `BUDGET_PROPOSAL_TASK_WAITING:${proposal.id}`,
      });
      await this.notifications.holdForDepartment(tx, {
        organizationId: proposal.organizationId,
        departmentId,
        code: assigned.code,
        subject: assigned.subject,
        params: assigned.params,
        eventKey: assigned.eventKey,
      });
    }
  }

  /**
   * A person became the head of the department while Finance's proposal waits to be sent again or withdrawn: the work falls to them
   * (row 54). The key is the one of the notice given when Finance gave it back, so a person who has it already, or who is handed the
   * one kept for the first head, is not told twice.
   */
  async proposalPassedToHead(
    tx: DbTx,
    proposal: ProposalRecord,
    departmentId: string,
    headEmployeeId: string,
  ): Promise<void> {
    await this.tell(tx, headEmployeeId, {
      organizationId: proposal.organizationId,
      code: 'BUDGET_PROPOSAL_TASK_ASSIGNED',
      subject: { type: 'BUDGET_PROPOSAL', id: proposal.id },
      params: { costCenterId: proposal.costCenterId, departmentId, year: proposal.year },
      eventKey: `BUDGET_PROPOSAL_TASK_ASSIGNED:${proposal.id}`,
    });
  }

  /**
   * Finance sent the version: the person who decides it is told (row 18); sent again after a request to look again, it is told again.
   * `approver` is the spending approver who works, as the sending read them with the row of the grant locked (`M6`); when nobody is, the
   * version waits and the Super Admin is told, once for this stretch of waiting (`D-S16`).
   */
  async versionSent(
    tx: DbTx,
    version: VersionRecord,
    proposalSubmittedBy: string | null,
    approver: string | null,
  ): Promise<void> {
    if (version.sentAt === null) return;
    if (approver === null) await this.versionWaiting(tx, version, `sent:${version.sentAt.getTime()}`);
    const decider = deciderOf(approver, proposalSubmittedBy);
    await this.tell(tx, decider.employeeId, {
      organizationId: version.organizationId,
      code: 'BUDGET_VERSION_AWAITING_DECISION',
      subject: { type: 'BUDGET_VERSION', id: version.id },
      params: { versionId: version.id, costCenterId: version.costCenterId, year: version.year },
      eventKey: `BUDGET_VERSION_AWAITING_DECISION:${version.id}:${version.sentAt.getTime()}`,
    });
  }

  /**
   * A version that was sent waits for a spending approver nobody holds who works: the Super Admin is told with the alert of the steps that
   * wait under control (line 27, `D-S16`), once for each stretch of waiting. `source` is what began the stretch — `sent:<ms>`,
   * `role:<id of the change>` or `left:<id of the change>` — so a change that is heard twice writes one notice, and a role given and taken
   * back again begins a new stretch with a new notice. The notice names the version and the year, never an amount.
   */
  async versionWaiting(tx: DbTx, version: VersionRecord, source: string): Promise<void> {
    await this.tell(tx, await this.facts.superAdminEmployeeId(tx), {
      organizationId: version.organizationId,
      code: 'CONTROLLED_WAIT_ALERT',
      subject: { type: 'BUDGET_VERSION', id: version.id },
      params: {
        versionId: version.id,
        costCenterId: version.costCenterId,
        year: version.year,
        waitingReason: 'NO_SPENDING_APPROVER',
        configurationHint: 'CONFIGURE_SPENDING_APPROVER',
      },
      eventKey: `CONTROLLED_WAIT_ALERT:BUDGET_VERSION:${version.id}:${source}`,
    });
  }

  /** The spending approver decided the version: Finance and the head of the department are told (row 40). */
  async versionDecided(
    tx: DbTx,
    version: VersionRecord,
    input: { decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'; reason: string | null; at: Date },
    today: BusinessDate,
  ): Promise<void> {
    const notice: Notice = {
      organizationId: version.organizationId,
      code: 'BUDGET_VERSION_DECIDED',
      subject: { type: 'BUDGET_VERSION', id: version.id },
      params: {
        versionId: version.id,
        costCenterId: version.costCenterId,
        year: version.year,
        decision: input.decision,
        reason: input.reason,
      },
      eventKey: `BUDGET_VERSION_DECIDED:${version.id}:${input.at.getTime()}`,
    };
    await this.tell(tx, await this.facts.financeEmployeeId(tx), notice);
    await this.tell(tx, await this.headOfCostCenter(tx, version.costCenterId, today), notice);
  }

  /**
   * The year ended on a version that never became current (row 52): Finance is told, and the person who held the decision when
   * it was waiting for one, since that work is closed without a decision.
   */
  async versionClosedUnapproved(
    tx: DbTx,
    version: VersionRecord,
    input: { wasWaitingForDecision: boolean; proposalSubmittedBy: string | null },
  ): Promise<void> {
    const notice: Notice = {
      organizationId: version.organizationId,
      code: 'BUDGET_VERSION_CLOSED_UNAPPROVED',
      subject: { type: 'BUDGET_VERSION', id: version.id },
      params: { versionId: version.id, costCenterId: version.costCenterId, year: version.year },
      eventKey: `BUDGET_VERSION_CLOSED_UNAPPROVED:${version.id}`,
    };
    await this.tell(tx, await this.facts.financeEmployeeId(tx), notice);
    if (input.wasWaitingForDecision) {
      await this.tell(
        tx,
        deciderOf(await this.facts.usableSpendingApproverEmployeeId(tx), input.proposalSubmittedBy).employeeId,
        notice,
      );
    }
  }

  /**
   * The year ended on a proposal that was never used (row 53): the head of the department of today is told; when nobody heads it,
   * the notice is kept for the first head the Super Admin names, and for nobody else.
   */
  async proposalClosedYearEnd(tx: DbTx, proposal: ProposalRecord, today: BusinessDate): Promise<void> {
    const departmentId = (await this.facts.departmentsOf([proposal.costCenterId], tx)).get(proposal.costCenterId);
    if (departmentId === undefined) return;
    const notice: Notice = {
      organizationId: proposal.organizationId,
      code: 'BUDGET_PROPOSAL_CLOSED_YEAR_END',
      subject: { type: 'BUDGET_PROPOSAL', id: proposal.id },
      params: { proposalId: proposal.id, costCenterId: proposal.costCenterId, year: proposal.year },
      eventKey: `BUDGET_PROPOSAL_CLOSED_YEAR_END:${proposal.id}`,
    };
    // Locked before the head is read: a notice kept for a department that gets a head meanwhile would be left undelivered (T-11).
    const head = await this.facts.currentHeadOfLocked(departmentId, today, tx);
    if (head !== null) {
      await this.tell(tx, head, notice);

      return;
    }
    await this.notifications.holdForDepartment(tx, {
      organizationId: notice.organizationId,
      departmentId,
      code: notice.code,
      subject: notice.subject,
      params: notice.params,
      eventKey: notice.eventKey,
    });
  }

  private async headOfCostCenter(tx: DbTx, costCenterId: string, today: BusinessDate): Promise<string | null> {
    const departmentId = (await this.facts.departmentsOf([costCenterId], tx)).get(costCenterId);

    return departmentId === undefined ? null : this.facts.currentHeadOf(departmentId, today, tx);
  }

  /** Nobody is told for a role nobody holds; the same person and event key write once. */
  /** The cycle of a year opened: the head of each department of the year hears the deadlines (`US-06-15` AC-1, QT 4.1). */
  async cycleOpened(
    tx: DbTx,
    cycle: { id: string; organizationId: string; year: number; submissionDeadline: BusinessDate },
    heads: readonly (string | null)[],
  ): Promise<void> {
    for (const head of new Set(heads)) {
      await this.tell(tx, head, {
        organizationId: cycle.organizationId,
        code: 'BUDGET_CYCLE_OPENED',
        subject: { type: 'BUDGET_CYCLE', id: cycle.id },
        params: { cycleId: cycle.id, year: cycle.year, submissionDeadline: cycle.submissionDeadline },
        eventKey: `BUDGET_CYCLE_OPENED:${cycle.id}:${head}`,
      });
    }
  }

  /** A ceiling was published or published again: the head of that department hears it, once for each publication (`US-06-15` AC-8). */
  async ceilingPublished(
    tx: DbTx,
    cycle: { id: string; organizationId: string; year: number },
    notice: { departmentId: string; headEmployeeId: string | null; publication: string },
  ): Promise<void> {
    await this.tell(tx, notice.headEmployeeId, {
      organizationId: cycle.organizationId,
      code: 'BUDGET_DEPARTMENT_CEILING_PUBLISHED',
      subject: { type: 'BUDGET_CYCLE', id: cycle.id },
      params: { cycleId: cycle.id, year: cycle.year, departmentId: notice.departmentId },
      eventKey: `BUDGET_DEPARTMENT_CEILING_PUBLISHED:${cycle.id}:${notice.departmentId}:${notice.publication}`,
    });
  }

  private async tell(tx: DbTx, recipientEmployeeId: string | null, notice: Notice): Promise<void> {
    if (recipientEmployeeId === null) return;
    await this.notifications.notifyInApp(tx, {
      organizationId: notice.organizationId,
      recipientEmployeeId,
      code: notice.code,
      subject: notice.subject,
      params: notice.params,
      eventKey: notice.eventKey,
    });
  }
}
