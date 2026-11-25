import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { EmployeeNotFoundError } from '../../organization/public/organization.errors';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { WorkspaceAdminNotItAdminError } from './workspace.errors';
import { peopleOf, toWorkspaceDetailWire, toWorkspaceSummaryWire, type WorkspaceContext } from './workspace.mapper';
import { notYetBlocked } from './workspace.policy';
import { WorkspaceRepo } from './workspace.repo';
import type { WorkspaceRecord } from './workspace.types';

/**
 * What a reader of workspaces needs beside the rows (W3-10): the names of the people, which administrators work now as IT Admins, and the answers
 * built from them; and the judgment of whether a person may be named for a workspace. It reads, it never writes.
 */
@Injectable()
export class WorkspaceViewService {
  constructor(
    private readonly repo: WorkspaceRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /**
   * Which of these people work now as IT Admins (`QĐ-110k`): an account that can act whose person a departure does not already refuse (the flag of a
   * workspace falls "from the block", before the person has left). One read of the accounts and one of the blocks, whatever the number.
   */
  async workingAdminsAmong(employeeIds: readonly string[], tx?: DbTx): Promise<Set<string>> {
    if (employeeIds.length === 0) return new Set();
    const usable = await this.identity.findUsableItAdminEmployeeIds(employeeIds, tx);
    if (usable.size === 0) return usable;
    const blocks = await this.identity.findDepartureBlocks([...usable], tx);
    const today = await this.organizationReads.businessToday(new Date(), tx);

    return notYetBlocked(
      usable,
      new Map([...blocks].map(([employeeId, block]) => [employeeId, block.blockedFrom])),
      today,
    );
  }

  /** The number of administrators of this workspace who work now as IT Admins. */
  async workingAdminCount(workspace: WorkspaceRecord, tx?: DbTx): Promise<number> {
    const working = await this.workingAdminsAmong(
      workspace.admins.map((admin) => admin.employeeId),
      tx,
    );

    return working.size;
  }

  /** Whether the person works, holds the IT Admin role and can sign in. */
  async isUsableItAdmin(employeeId: string, tx?: DbTx): Promise<boolean> {
    const usable = await this.identity.findUsableItAdminEmployeeIds([employeeId], tx);
    const employee = usable.has(employeeId) ? await this.organizationReads.getEmployee(employeeId, tx) : null;

    return employee?.status === 'ACTIVE' && employee.workState === 'WORKING';
  }

  /**
   * The person must be an employee still working with a usable IT Admin account. The employee is locked first and the account second (the lock order
   * of the identity facade), so a departure or a lock cannot slip in. Throws WorkspaceAdminNotItAdminError.
   */
  async requireItAdmin(tx: DbTx, employeeId: string): Promise<void> {
    try {
      await this.organizationReads.lockEmployeeForShare(tx, employeeId);
    } catch (error) {
      if (error instanceof EmployeeNotFoundError) throw new WorkspaceAdminNotItAdminError(employeeId);
      throw error;
    }
    const employee = await this.organizationReads.getEmployee(employeeId, tx);
    if (!employee || employee.status !== 'ACTIVE') throw new WorkspaceAdminNotItAdminError(employeeId);
    const account = await this.identity.inspectEmployeeAccount(tx, employeeId);
    if (!account.usable || !account.roles.includes('IT_ADMIN')) throw new WorkspaceAdminNotItAdminError(employeeId);
  }

  /** The context of these workspaces, built with one read of the names, one of the accounts and one of the counts, whatever their number. */
  private async contexts(records: readonly WorkspaceRecord[], tx?: DbTx): Promise<Map<string, WorkspaceContext>> {
    const everyone = [...new Set(records.flatMap(peopleOf))];
    const employees = everyone.length > 0 ? await this.organizationReads.getEmployees(everyone, tx) : [];
    const names = new Map(employees.map((employee) => [employee.id, employee.fullName]));
    const working = await this.workingAdminsAmong(
      [...new Set(records.flatMap((record) => record.admins.map((admin) => admin.employeeId)))],
      tx,
    );
    const counts = await this.repo.subscriptionCountsOf(records.map((record) => record.id));

    return new Map(
      records.map((record) => [record.id, { names, working, subscriptionCount: counts.get(record.id) ?? 0 }]),
    );
  }

  /** The rows of the list for these workspaces, in the order given. */
  async summaries(records: readonly WorkspaceRecord[], tx?: DbTx) {
    const contexts = await this.contexts(records, tx);

    return records.map((record) => toWorkspaceSummaryWire(record, contexts.get(record.id) as WorkspaceContext));
  }

  /** The workspace as a detail. */
  async detail(record: WorkspaceRecord, tx?: DbTx) {
    const contexts = await this.contexts([record], tx);

    return toWorkspaceDetailWire(record, contexts.get(record.id) as WorkspaceContext);
  }
}
