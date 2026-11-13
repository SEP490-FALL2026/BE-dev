import { Injectable } from '@nestjs/common';
import { addDays, monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingDashboardApi } from '../../licensing/public/licensing-dashboard.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelDashboardApi } from '../../personnel/public/personnel-dashboard.api';
import { RequestsDashboardApi } from '../../requests/public/requests-dashboard.api';
import { assertHoldsOneOf } from '../section/dashboard-section.policy';
import { REPORT_MAX_DAYS, type RevocationSlaQuery, type RevocationSlaWire } from './revocation-sla.dto';
import {
  outcomeOf,
  rowsOf,
  summaryOf,
  transferReRequestsOf,
  type SlaTask,
  type SlaUnit,
} from './revocation-sla.policy';

/**
 * The report of the SLA of the revocations (SPEC P22, R5 E3, E7): how fast the IT Admin takes the rights of the people who leave or move away,
 * against the first working day of the window of each departure or transfer, and how many of the requests sent again in the grace of a transfer
 * were granted by its last day. An operational figure beside the overviews, not a KPI. The Super Admin reads the whole company; an IT Admin only the
 * departments they are in charge of or stand in for, so a department outside the scope has no row and no figure in the total. Every read goes through the
 * facade of the module that owns the data: the windows and the graces from personnel, the tasks from licensing, the requests from requests. Reads only.
 */
@Injectable()
export class RevocationSlaQueryService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly personnel: PersonnelDashboardApi,
    private readonly licensing: LicensingDashboardApi,
    private readonly requests: RequestsDashboardApi,
    private readonly parameters: OperatingParametersApi,
  ) {}

  /** Throws DashboardRefusedError for a caller who is neither the Super Admin nor an IT Admin. */
  async report(actor: AuthenticatedPrincipal, query: RevocationSlaQuery): Promise<RevocationSlaWire> {
    assertHoldsOneOf(actor.roles, ['SUPER_ADMIN', 'IT_ADMIN']);
    const today = await this.organizationReads.businessToday();
    const { from, to } = rangeOf(query, today);
    const departmentIds = actor.roles.includes('SUPER_ADMIN')
      ? undefined
      : await this.organizationReads.getItAdminScope(actor.employeeId, (ids) =>
          this.identity.findUsableItAdminEmployeeIds(ids),
        );
    const windows = await this.personnel.revocationWindows({ from, to, source: query.source, departmentIds });
    const outcomes = await this.outcomesOf(windows, { today, from, departmentIds });
    const rows = rowsOf(outcomes, query.groupBy);
    const page = rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);

    return {
      from,
      to,
      source: query.source ?? null,
      groupBy: query.groupBy,
      ...summaryOf(outcomes),
      rows: await this.named(page, query.groupBy),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: rows.length,
        totalPages: Math.ceil(rows.length / query.pageSize),
      },
      transferReRequests:
        query.source === 'OFFBOARDING'
          ? { total: 0, provisionedWithinGrace: 0 }
          : await this.reRequests(from, to, departmentIds),
    };
  }

  private async outcomesOf(
    windows: readonly SlaUnit[],
    context: { today: BusinessDate; from: BusinessDate; departmentIds: readonly string[] | undefined },
  ) {
    const departures = windows.filter((window) => window.source === 'OFFBOARDING');
    const transfers = windows.filter((window) => window.source === 'TRANSFER');
    const tasks = new Map<string, SlaTask[]>();
    const keep = (
      kind: 'OFFBOARDING_CASE' | 'DEPARTMENT_TRANSFER',
      found: Awaited<ReturnType<LicensingDashboardApi['revocationTasksOf']>>,
    ) => {
      for (const task of found) {
        tasks.set(`${kind}:${task.referenceId}`, [
          ...(tasks.get(`${kind}:${task.referenceId}`) ?? []),
          { status: task.status, completedOn: task.completedOn, responsibleEmployeeId: task.responsibleEmployeeId },
        ]);
      }
    };
    keep(
      'OFFBOARDING_CASE',
      await this.licensing.revocationTasksOf(
        'OFFBOARDING_CASE',
        departures.map((unit) => unit.id),
      ),
    );
    keep(
      'DEPARTMENT_TRANSFER',
      await this.licensing.revocationTasksOf(
        'DEPARTMENT_TRANSFER',
        transfers.map((unit) => unit.id),
      ),
    );
    const late =
      departures.length === 0 ? [] : await this.personnel.lateDepartures(context.today, context.departmentIds);
    const nonWorking = await this.parameters.getNonWorkingDates(addDays(context.from, -1), context.today);

    return windows.map((unit) =>
      outcomeOf(
        unit,
        tasks.get(`${unit.source === 'OFFBOARDING' ? 'OFFBOARDING_CASE' : 'DEPARTMENT_TRANSFER'}:${unit.id}`) ?? [],
        { today: context.today, nonWorking, lateCaseIds: new Set(late.map((row) => row.id)) },
      ),
    );
  }

  /** The requests sent again in a grace and the ones granted by its last day, matched to the graces of the people who sent them. */
  private async reRequests(from: BusinessDate, to: BusinessDate, departmentIds: readonly string[] | undefined) {
    const sent = await this.requests.transferGraceRequests({ from, to, departmentIds });
    if (sent.length === 0) return { total: 0, provisionedWithinGrace: 0 };
    const graces = await this.personnel.graceWindowsOf([
      ...new Set(sent.map((request) => request.requesterEmployeeId)),
    ]);

    return transferReRequestsOf(sent, graces);
  }

  /** The rows of the page with the name of the department or of the IT Admin: one read of each, whatever the number of rows. */
  private async named(
    page: ReturnType<typeof rowsOf>,
    groupBy: RevocationSlaQuery['groupBy'],
  ): Promise<RevocationSlaWire['rows']> {
    const ids = page.flatMap((row) => (row.id ? [row.id] : []));
    const names = new Map<string, string>();
    if (groupBy === 'department') {
      for (const brief of await this.organizationReads.getDepartmentBriefs(ids)) names.set(brief.id, brief.name);
    } else {
      for (const employee of await this.organizationReads.getEmployees(ids)) names.set(employee.id, employee.fullName);
    }

    return page.map(({ id, ...figures }) => ({ key: { id, name: id ? (names.get(id) ?? null) : null }, ...figures }));
  }
}

/**
 * The range of days the windows open on: from the first of this month to today by default; given only `from`, to today or a year on, whichever is first;
 * given only `to`, from the first of its month. Both are checked together by the query itself.
 */
export function rangeOf(
  query: Pick<RevocationSlaQuery, 'from' | 'to'>,
  today: BusinessDate,
): { from: BusinessDate; to: BusinessDate } {
  const to = query.to ?? (query.from ? minDay(today, addDays(query.from, REPORT_MAX_DAYS - 1)) : today);
  const from = query.from ?? monthBoundsOf(to).start;

  return { from, to };
}

const minDay = (a: BusinessDate, b: BusinessDate): BusinessDate => (a <= b ? a : b);
