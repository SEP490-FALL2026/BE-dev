import { Injectable } from '@nestjs/common';
import { TransactionRunner, readSqlState } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { AccountDirectoryService } from '../accounts/account-directory.service';
import { RoleGrantService } from '../accounts/role-grant.service';
import { employeeHasNotLeft } from '../policies/account-policy';
import { ApprovalRoleHolderInvalidError, ApprovalRolePairingError } from './approval-role.errors';
import { cutHistory } from '../../../core/application/pagination';
import { APPROVAL_ROLES, ApprovalRoleName, ApprovalRoleRepo } from './approval-role.repo';
import { ApprovalRoleChangeRegistry } from './approval-role-change.registry';

const HISTORY_LIMIT = 20;

export interface ApprovalRoleView {
  role: ApprovalRoleName;
  holder: { employeeId: string; employeeCode: string; fullName: string; since: Date } | null;
  history: { employeeId: string; employeeCode: string; fullName: string; from: Date; until: Date | null }[];
  /** The role has older holders than the {@link HISTORY_LIMIT} shown. */
  historyHasMore: boolean;
}

/**
 * The three approval roles the Super Admin sets (`US-01-03`): the spending approver (the one person who decides
 * spending), the substitute who decides instead when the approver is the requester or the beneficiary, and the
 * fallback approver who stands in as a Manager for a department that has no head. Setting a role is configuration,
 * never an approval (`SoD-1`); there is no way to delegate it to anyone else (AC-5). Who holds each role is read by the
 * approval workflow when it is built; nothing here decides a request.
 */
@Injectable()
export class ApprovalRoleService {
  constructor(
    private readonly repo: ApprovalRoleRepo,
    private readonly accounts: AccountDirectoryService,
    private readonly grants: RoleGrantService,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
    private readonly changes: ApprovalRoleChangeRegistry,
  ) {}

  async list(): Promise<ApprovalRoleView[]> {
    const current = await this.repo.currentHolders();
    const histories = await Promise.all(APPROVAL_ROLES.map((role) => this.repo.history(role, HISTORY_LIMIT + 1)));
    const cuts = histories.map((rows) => cutHistory(rows, HISTORY_LIMIT));
    const employeeIds = [
      ...new Set([
        ...current.map((row) => row.employeeId),
        ...cuts.flatMap((cut) => cut.items.map((row) => row.employeeId)),
      ]),
    ];
    const people = new Map(
      (await this.organization.getEmployees(employeeIds)).map((employee) => [employee.id, employee]),
    );
    const named = (employeeId: string) => {
      const employee = people.get(employeeId);

      return { employeeId, employeeCode: employee?.employeeCode ?? '', fullName: employee?.fullName ?? '' };
    };

    return APPROVAL_ROLES.map((role, index) => {
      const holder = current.find((row) => row.role === role);

      return {
        role,
        holder: holder ? { ...named(holder.employeeId), since: holder.heldFrom } : null,
        historyHasMore: cuts[index].hasMore,
        history: cuts[index].items.map((row) => ({
          ...named(row.employeeId),
          from: row.heldFrom,
          until: row.heldUntil,
        })),
      };
    });
  }

  /**
   * Names the holder of a role from now on; the one before ends now (AC-1, AC-3). The person must have not left,
   * must have an account that can sign in (AC-6), must not hold the Super Admin role (AC-2), and the substitute must
   * not be the spending approver (AC-7). Naming the person who already holds it changes nothing.
   */
  async set(actor: AuthenticatedPrincipal, role: ApprovalRoleName, employeeId: string): Promise<ApprovalRoleView[]> {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('The approval roles were used before installation');

    await this.runner.run(async (tx) => {
      // Lock order: the advisory key for these roles, then the employee, then the account (lock protocol).
      await this.repo.lockForChange(tx);
      await this.organization.lockEmployeeForShare(tx, employeeId);
      const employee = await this.organization.getEmployee(employeeId, tx);
      if (!employeeHasNotLeft(employee)) throw new ApprovalRoleHolderInvalidError('EMPLOYEE_NOT_ACTIVE');

      const appUserId = await this.accounts.findAccountIdByEmployee(tx, employeeId);
      if (appUserId === null) throw new ApprovalRoleHolderInvalidError('NO_USABLE_ACCOUNT');
      await this.accounts.lockAppUser(tx, appUserId, 'SHARE');
      const account = await this.accounts.readAccount(tx, appUserId);
      if (!account || account.status !== 'ACTIVE' || account.activationState !== 'ACTIVATED') {
        throw new ApprovalRoleHolderInvalidError('NO_USABLE_ACCOUNT');
      }
      if ((await this.grants.effectiveRoles(appUserId, tx)).includes('SUPER_ADMIN')) {
        throw new ApprovalRoleHolderInvalidError('SUPER_ADMIN_CANNOT_HOLD');
      }

      const holders = await this.repo.currentHolders(tx);
      const current = holders.find((row) => row.role === role);
      if (current?.employeeId === employeeId) return;
      const counterpart =
        role === 'SPENDING_APPROVER'
          ? 'CONFLICT_SUBSTITUTE'
          : role === 'CONFLICT_SUBSTITUTE'
            ? 'SPENDING_APPROVER'
            : null;
      if (counterpart && holders.find((row) => row.role === counterpart)?.employeeId === employeeId) {
        throw new ApprovalRolePairingError();
      }

      const now = new Date();
      await this.repo.closeCurrent(tx, role, now);
      let created: { id: string };
      try {
        created = await this.repo.insert(tx, {
          organizationId: organization.id,
          role,
          employeeId,
          heldFrom: now,
          setBy: actor.appUserId,
        });
      } catch (error) {
        // The database's own pairing check, if something wrote around the service.
        if (readSqlState(error) === '23514') throw new ApprovalRolePairingError();
        throw error;
      }
      const previous = current ? await this.organization.getEmployee(current.employeeId, tx) : null;
      await this.audit.record(tx, {
        organizationId: organization.id,
        actorKind: 'USER',
        actorAppUserId: actor.appUserId,
        actorRoles: actor.roles,
        action: 'APPROVAL_ROLE.CHANGED',
        resourceType: 'ApprovalRole',
        resourceId: created.id,
        before: { role, holder: previous?.employeeCode ?? null },
        after: { role, holder: employee.employeeCode },
        correlationId: actor.sessionId,
      });
      // The steps held by the one who held the role move in this transaction, so the one who held it cannot decide after it.
      await this.changes.announce(tx, {
        role,
        fromEmployeeId: current?.employeeId ?? null,
        toEmployeeId: employeeId,
      });
    });

    return this.list();
  }
}
