import { Injectable, Logger } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import { pageOf, type Page } from '../../../../core/application/pagination';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../../audit/public/audit.api';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import { OrganizationApi } from '../../../organization/public/organization.api';
import { ResponsibleDeadlineHook } from '../../public/licensing.extension-points';
import type { ServiceAccountDuty } from '../../public/licensing-service-account.types';
import { ServiceAccountDutyTooManyError } from '../service-account.errors';
import type { ServiceAccountDutyWire } from './service-account.dto';
import { ServiceAccountDutyRepo, type DutyRow } from './service-account-duty.repo';

/** The most people with a file that waits one list reads (`US-03-08`): a guard against a list that cannot be read at once, not a business number. */
export const MAX_PEOPLE_WITH_FILES = 1000;
/** How many reminders one pass writes; the next pass takes the rest. */
const NOTICE_BATCH = 200;

/**
 * The service accounts that wait for a person to answer for them (`US-03-08` AC-1, AC-5, AC-6; `US-03-01` AC-9; `US-03-04` AC-17).
 * A duty is read, not stored: it is an open service account whose person has a transfer or a departure that is not closed. The
 * accounts are listed with the day that binds them; when the day passes nothing is changed or taken away, and a reminder is written
 * once for the account and the day (the point the alert to the IT Admin is taken from).
 */
@Injectable()
export class ServiceAccountDutyService {
  private readonly logger = new Logger(ServiceAccountDutyService.name);

  constructor(
    private readonly repo: ServiceAccountDutyRepo,
    private readonly deadlines: ResponsibleDeadlineHook,
    private readonly organization: OrganizationApi,
    private readonly catalog: CatalogApi,
    private readonly runner: TransactionRunner,
    private readonly audit: AuditApi,
  ) {}

  /** The open service accounts these people answer for: what keeps a transfer or a departure from being closed. */
  openOf(employeeIds: readonly string[], tx?: DbTx): Promise<ServiceAccountDuty[]> {
    return this.repo.openOf(employeeIds, tx);
  }

  /**
   * One page of the open service accounts of the people who have a file that waits, the earliest day first. Throws
   * ServiceAccountDutyTooManyError when more people have a file than the list can take, and the log says so.
   */
  async list(query: {
    employeeId?: string;
    overdue?: boolean;
    page: number;
    pageSize: number;
  }): Promise<Page<ServiceAccountDutyWire>> {
    const today = await this.organization.businessToday();
    const files = await this.filesOfPeopleAnswering({ ...(query.employeeId ? { employeeId: query.employeeId } : {}) });
    const { rows, total } = await this.repo.page(
      files,
      { today, ...(query.overdue === undefined ? {} : { overdue: query.overdue }) },
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );

    return pageOf(await this.named(rows, today), total, query.page, query.pageSize);
  }

  /**
   * Writes the reminder, once for each account and day, for the accounts whose day has passed without a new person, with the audit
   * event the alert is taken from. Nothing is changed or revoked. Returns how many were written in this pass.
   */
  async noticeOverdue(now: Date = new Date()): Promise<number> {
    const today = await this.organization.businessToday(now);
    const files = await this.filesOfPeopleAnswering({ dueBefore: today });
    const organization = await this.organization.getOrganization();
    if (files.length === 0 || !organization) return 0;
    let told = 0;
    for (const row of await this.repo.unnoticed(files, NOTICE_BATCH)) {
      const written = await this.runner.run(async (tx) => {
        if (!(await this.repo.insertNotice(tx, row.assignmentId, row.dueOn))) return false;
        await this.audit.record(tx, {
          organizationId: organization.id,
          actorKind: 'SYSTEM',
          action: 'SERVICE_ACCOUNT_DUTY.OVERDUE',
          resourceType: 'LicenseAssignment',
          resourceId: row.assignmentId,
          before: null,
          after: {
            employeeId: row.employeeId,
            owningDepartmentId: row.owningDepartmentId,
            dueOn: row.dueOn,
            fileKind: row.fileKind,
            fileId: row.fileId,
          },
          correlationId: row.fileId,
        });

        return true;
      });
      if (written) told += 1;
    }

    return told;
  }

  /**
   * The files that wait on people who answer for an open service account, the earliest day first. Throws
   * ServiceAccountDutyTooManyError when more people than the list can take are in that case, and the log says so.
   */
  private async filesOfPeopleAnswering(filter: { employeeId?: string; dueBefore?: BusinessDate }) {
    const people = filter.employeeId ? [filter.employeeId] : await this.repo.peopleAnswering(MAX_PEOPLE_WITH_FILES + 1);
    const files = await this.deadlines.get().listPending({
      employeeIds: people,
      ...(filter.dueBefore ? { dueBefore: filter.dueBefore } : {}),
      limit: MAX_PEOPLE_WITH_FILES + 1,
    });
    if (people.length > MAX_PEOPLE_WITH_FILES || files.length > MAX_PEOPLE_WITH_FILES) {
      this.logger.error(`More than ${MAX_PEOPLE_WITH_FILES} people answer for a service account that waits on a file`);
      throw new ServiceAccountDutyTooManyError();
    }

    return files;
  }

  /** The names a page shows, read once for the whole page. */
  private async named(rows: readonly DutyRow[], today: string): Promise<ServiceAccountDutyWire[]> {
    const [people, departments, plans] = await Promise.all([
      this.organization.getEmployees([...new Set(rows.map((row) => row.employeeId))]),
      this.organization.getDepartmentBriefs([
        ...new Set(rows.flatMap((row) => (row.owningDepartmentId ? [row.owningDepartmentId] : []))),
      ]),
      this.catalog.getPlanSummaries([...new Set(rows.map((row) => row.planId))]),
    ]);
    const personById = new Map(people.map((person) => [person.id, person]));
    const departmentById = new Map(departments.map((department) => [department.id, department]));
    const planById = new Map(plans.map((plan) => [plan.planId, plan]));

    return rows.flatMap((row): ServiceAccountDutyWire[] => {
      const person = personById.get(row.employeeId);
      const plan = planById.get(row.planId);
      if (!person || !plan) return [];
      const department = row.owningDepartmentId ? departmentById.get(row.owningDepartmentId) : undefined;

      return [
        {
          assignmentId: row.assignmentId,
          accountIdentifier: row.accountIdentifier,
          plan: { planId: plan.planId, planName: plan.planName, applicationName: plan.applicationName },
          owningDepartment: department ? { id: department.id, code: department.code, name: department.name } : null,
          responsible: { employeeId: person.id, employeeCode: person.employeeCode, fullName: person.fullName },
          dueOn: row.dueOn,
          fileKind: row.fileKind,
          fileId: row.fileId,
          overdue: row.dueOn < today,
        },
      ];
    });
  }
}
