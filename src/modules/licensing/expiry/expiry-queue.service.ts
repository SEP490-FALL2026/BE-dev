import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogService } from '../../catalog/catalog.service';
import { OrganizationService } from '../../organization/organization.service';
import { RegisteredRenewalHold } from '../assignment/registered-renewal-hold.service';
import { HandoverService } from '../handover/handover.service';
import type { PendingRenewal } from '../licensing-renewal.types';
import { RevocationService } from '../provisioning/revocation.service';
import type { ExpiredRightWire, StartedRevocationWire } from './expiry.dto';
import { ExpiryError } from './expiry.errors';
import { daysOverdue, isDebt, queueStatusOf, startRefusalOf, type ExpiryQueueStatus } from './expiry.policy';
import { ExpiryQueueRepo, type ExpiredRight } from './expiry-queue.repo';

interface QueueQuery {
  status?: ExpiryQueueStatus;
  debt?: boolean;
  departmentId?: string;
  page: number;
  pageSize: number;
}

/**
 * The queue of the IT Admin for the rights that ended on a day (`US-03-05` AC-2, AC-6 to AC-9, AC-11). It is read, never stored: an
 * open personal right whose end day has passed is in it, in force until the IT Admin acts (nothing is revoked or renewed by
 * itself), kept waiting while a renewal sent in time is undecided, and shown with the revocation that is under way and its
 * handover confirmation. Starting the revocation goes through the one gate every source calls, with the source
 * `TIME_LIMITED_EXPIRY`: its handover step falls to the IT Admin, and a revocation that fails leaves the right in force.
 */
@Injectable()
export class ExpiryQueueService {
  constructor(
    private readonly repo: ExpiryQueueRepo,
    private readonly renewals: RegisteredRenewalHold,
    private readonly revocations: RevocationService,
    private readonly handovers: HandoverService,
    private readonly organization: OrganizationService,
    private readonly catalog: CatalogService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * One page of the rights that ended, the earliest end first. The statements are the same however many rights there are: the
   * rights, the renewals waiting, the departments, and then the names and the handover of the page.
   */
  async list(query: QueueQuery): Promise<Page<ExpiredRightWire>> {
    const today = await this.organization.businessToday();
    const expired = await this.repo.expired(today);
    const [pending, units] = await Promise.all([
      this.renewals.pendingRenewalsOf(expired.map((right) => right.assignmentId)),
      this.organization.getOwningUnits([...new Set(expired.map((right) => right.employeeId))], today),
    ]);

    const rows = expired
      .map((right) => ({
        right,
        renewal: pending.get(right.assignmentId) ?? null,
        departmentId: units.get(right.employeeId)?.departmentId ?? null,
        status: queueStatusOf({
          revocationOpen: right.revocation !== null,
          renewalPending: pending.has(right.assignmentId),
        }),
      }))
      .filter(
        (row) =>
          (!query.status || row.status === query.status) &&
          (query.debt === undefined || isDebt(row.right.expectedEndDate, today) === query.debt) &&
          (!query.departmentId || row.departmentId === query.departmentId),
      );
    const start = (query.page - 1) * query.pageSize;
    const shown = rows.slice(start, start + query.pageSize);

    return pageOf(await this.named(shown, today), rows.length, query.page, query.pageSize);
  }

  /**
   * Starts the revocation of a right that ended: refused while the end day has not passed or a renewal sent in time waits; asking
   * again, or while another source already has a revocation under way, adds nothing twice. One transaction. Throws ExpiryError
   * (`NOT_FOUND`, `NOT_OPEN`, `NOT_EXPIRED`, `RENEWAL_PENDING`) and what the gate throws.
   */
  async startRevocation(actor: AuthenticatedPrincipal, assignmentId: string): Promise<StartedRevocationWire> {
    const now = new Date();
    const today = await this.organization.businessToday(now);
    const facts = await this.repo.factsOf(assignmentId);
    if (!facts) throw new ExpiryError('NOT_FOUND');
    const renewalPending = facts.open && (await this.renewals.pendingRenewalsOf([assignmentId])).has(assignmentId);
    const refusal = startRefusalOf({
      kind: facts.kind,
      expectedEndDate: facts.expectedEndDate,
      open: facts.open,
      today,
      status: queueStatusOf({ revocationOpen: facts.revocation !== null, renewalPending }),
    });
    if (refusal) throw new ExpiryError(refusal);

    const opened = await this.runner.run((tx) =>
      this.revocations.open(tx, actor, {
        assignmentId,
        source: 'TIME_LIMITED_EXPIRY',
        // The end date the right was given decides, not a person (`FR-2.8`).
        decision: {
          decidedByEmployeeId: null,
          decidedRole: 'END_DATE',
          referenceKind: 'ASSIGNMENT_END_DATE',
          referenceId: assignmentId,
        },
        now,
      }),
    );

    return {
      assignmentId,
      taskId: opened.taskId,
      taskStatus: opened.status,
      created: opened.created,
      reasonAdded: opened.reasonAdded,
    };
  }

  /** The names, the plan and the handover of the rows of one page, each read once for the whole page. */
  private async named(
    shown: readonly {
      right: ExpiredRight;
      renewal: PendingRenewal | null;
      departmentId: string | null;
      status: ExpiryQueueStatus;
    }[],
    today: string,
  ): Promise<ExpiredRightWire[]> {
    if (shown.length === 0) return [];
    const [people, departments, plans, duties] = await Promise.all([
      this.organization.getEmployees([...new Set(shown.map((row) => row.right.employeeId))]),
      this.organization.getDepartmentBriefs([
        ...new Set(shown.flatMap((row) => (row.departmentId ? [row.departmentId] : []))),
      ]),
      this.catalog.getPlanRevocationInfo([...new Set(shown.map((row) => row.right.planId))]),
      this.handovers.briefsOf(shown.filter((row) => row.right.revocation).map((row) => row.right.assignmentId)),
    ]);
    const personById = new Map(people.map((person) => [person.id, person]));
    const departmentById = new Map(departments.map((department) => [department.id, department]));
    const planById = new Map(plans.map((plan) => [plan.planId, plan]));
    const dutyOf = new Map(duties.map((duty) => [duty.assignmentId, duty]));

    return shown.flatMap((row): ExpiredRightWire[] => {
      const person = personById.get(row.right.employeeId);
      const plan = planById.get(row.right.planId);
      if (!person || !plan) return [];
      const department = row.departmentId ? departmentById.get(row.departmentId) : undefined;
      const duty = dutyOf.get(row.right.assignmentId);

      return [
        {
          assignmentId: row.right.assignmentId,
          employee: { id: person.id, employeeCode: person.employeeCode, fullName: person.fullName },
          department: department ? { id: department.id, code: department.code, name: department.name } : null,
          plan: {
            planId: plan.planId,
            planName: plan.planName,
            applicationId: plan.applicationId,
            applicationName: plan.applicationName,
            provisioningType: plan.provisioningType,
            dataLossOnRemoval: plan.dataLossOnRemoval,
          },
          expectedEndDate: row.right.expectedEndDate,
          daysOverdue: daysOverdue(row.right.expectedEndDate, today),
          debt: isDebt(row.right.expectedEndDate, today),
          status: row.status,
          pendingRenewal: row.renewal ? { requestId: row.renewal.requestId, state: row.renewal.state } : null,
          revocation: row.right.revocation
            ? { taskId: row.right.revocation.taskId, status: row.right.revocation.status }
            : null,
          handover: duty
            ? {
                dutyId: duty.dutyId,
                status: duty.status,
                role: duty.role,
                dueOn: duty.dueOn,
                overdue: duty.overdue,
                flaggedUnconfirmed: duty.flaggedUnconfirmed,
              }
            : null,
        },
      ];
    });
  }
}
