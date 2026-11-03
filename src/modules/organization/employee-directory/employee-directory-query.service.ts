import { Injectable } from '@nestjs/common';
import { cutHistory, pageOf, type Page } from '../../../core/application/pagination';
import { OrganizationContextService } from '../organization-context.service';
import { EmployeeNotFoundError } from '../public/organization.errors';
import { EmployeeAccountsHook, type EmployeeAccountSummary } from '../public/organization.extension-points';
import type { EmployeeListQueryDto } from './employee-directory.dto';
import {
  toEmployeeDetailWire,
  toEmployeeSummaryWire,
  type EmployeeDetailWire,
  type EmployeeSummaryWire,
} from './employee-directory.mapper';
import { EmployeeDirectoryRepo } from './employee-directory.repo';
import { EMPLOYEE_PLACEMENT_HISTORY_LIMIT } from './employee-directory.types';

@Injectable()
export class EmployeeDirectoryQueryService {
  constructor(
    private readonly repo: EmployeeDirectoryRepo,
    private readonly context: OrganizationContextService,
    private readonly employeeAccounts: EmployeeAccountsHook,
  ) {}

  /**
   * Lists employees with filtering and pagination.
   * Fixed order of statements:
   * 1. businessToday()
   * 2. findEmployeeIdsWithAccount() (when hasAccount is present)
   * 3. listEmployees (page + count in one RepeatableRead snapshot)
   * 4. summarizeAccounts (one statement on app_users only)
   */
  async listEmployees(query: EmployeeListQueryDto): Promise<Page<EmployeeSummaryWire>> {
    const today = await this.context.businessToday();

    let accountEmployeeIds: readonly string[] | undefined;
    let excludeAccountEmployeeIds: readonly string[] | undefined;

    if (query.hasAccount !== undefined) {
      const idsWithAccount = await this.employeeAccounts.get().findEmployeeIdsWithAccount();
      if (query.hasAccount) {
        accountEmployeeIds = idsWithAccount;
      } else {
        excludeAccountEmployeeIds = idsWithAccount;
      }
    }

    const { items: rows, total } = await this.repo.listEmployees(
      {
        q: query.q,
        departmentId: query.departmentId,
        unplaced: query.unplaced,
        workState: query.workState,
        employmentType: query.employmentType,
        accountEmployeeIds,
        excludeAccountEmployeeIds,
        page: query.page,
        pageSize: query.pageSize,
      },
      today,
    );

    const pageEmployeeIds = rows.map((r) => r.id);
    const accountMap: ReadonlyMap<string, EmployeeAccountSummary> =
      pageEmployeeIds.length > 0
        ? await this.employeeAccounts.get().summarizeAccounts(pageEmployeeIds)
        : new Map<string, EmployeeAccountSummary>();

    const items = rows.map((row) => toEmployeeSummaryWire(row, accountMap.get(row.id)));

    return pageOf(items, total, query.page, query.pageSize);
  }

  /**
   * Reads full profile and placement history for one employee.
   * Statement order:
   * 1. businessToday()
   * 2. repo.findEmployeeDetail (employee + placement history)
   * 3. describeAccount (app_users + active roles in one statement, unlocked)
   */
  async getEmployee(employeeId: string): Promise<EmployeeDetailWire> {
    const today = await this.context.businessToday();
    const detail = await this.repo.findEmployeeDetail(employeeId, today);

    if (!detail) {
      throw new EmployeeNotFoundError(employeeId);
    }

    const account = await this.employeeAccounts.get().describeAccount(employeeId);
    const { items: placements, hasMore: placementsHasMore } = cutHistory(
      detail.rawPlacements,
      EMPLOYEE_PLACEMENT_HISTORY_LIMIT,
    );

    return toEmployeeDetailWire(detail.employee, placements, placementsHasMore, account);
  }
}
