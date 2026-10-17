import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TransactionRunner, readSqlState } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { AccountRepo } from './account.repo';
import { SuccessorEligibility, SuccessorProblem } from './successor-eligibility';

export type SuperAdminTransferProblem = SuccessorProblem | 'NOT_HOLDER' | 'SUCCESSOR_IS_HOLDER';

/** The transfer cannot happen; nothing was changed and nothing was recorded (US-01-09 AC-3, AC-5). */
export class SuperAdminTransferRefusedError extends Error {
  constructor(readonly problem: SuperAdminTransferProblem) {
    super(`The Super Admin role cannot be transferred: ${problem}.`);
    this.name = 'SuperAdminTransferRefusedError';
  }
}

export interface SuperAdminTransferResult {
  transferId: string;
  from: { appUserId: string };
  to: { appUserId: string };
}

/**
 * The one way the Super Admin role changes hands in the application (`US-01-09`): the holder passes it to a
 * successor in a single step, and the role leaves the holder in the same transaction. The ordinary grant and
 * revoke routes never touch it (AC-7), so there is never a moment with two Super Admins or none.
 */
@Injectable()
export class SuperAdminTransferService {
  constructor(
    private readonly accounts: AccountRepo,
    private readonly eligibility: SuccessorEligibility,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  async transfer(actor: AuthenticatedPrincipal, successorAppUserId: string): Promise<SuperAdminTransferResult> {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A Super Admin role was transferred before installation');
    if (successorAppUserId === actor.appUserId) throw new SuperAdminTransferRefusedError('SUCCESSOR_IS_HOLDER');

    // An unlocked read only to learn which employee to lock first; everything is read again under the locks.
    const located = await this.accounts.findAccountById(successorAppUserId);
    if (!located) throw new SuperAdminTransferRefusedError('SUCCESSOR_NOT_FOUND');

    const transferId = randomUUID();
    await this.runner.run(async (tx) => {
      // Lock order (protocol): the employee of the successor, then the two accounts, in id order.
      await this.organization.lockEmployeeForShare(tx, located.employeeId);
      const [first, second] = [actor.appUserId, successorAppUserId].sort();
      await this.accounts.lockAppUser(tx, first, 'UPDATE');
      await this.accounts.lockAppUser(tx, second, 'UPDATE');

      const holderRoles = await this.accounts.effectiveRoles(actor.appUserId, tx);
      if (!holderRoles.includes('SUPER_ADMIN')) throw new SuperAdminTransferRefusedError('NOT_HOLDER');

      const problem = await this.eligibility.check(tx, successorAppUserId);
      if (problem) throw new SuperAdminTransferRefusedError(problem);
      const successorRoles = await this.accounts.effectiveRoles(successorAppUserId, tx);

      const now = new Date();
      const revoked = await this.accounts.revokeRole(tx, {
        appUserId: actor.appUserId,
        role: 'SUPER_ADMIN',
        revokedBy: actor.appUserId,
        now,
      });
      if (!revoked) throw new SuperAdminTransferRefusedError('NOT_HOLDER');
      try {
        await this.accounts.grantRole(tx, {
          organizationId: organization.id,
          appUserId: successorAppUserId,
          role: 'SUPER_ADMIN',
          grantedBy: actor.appUserId,
        });
      } catch (error) {
        // The database's own guards (one holder; no work role beside it) are the last defence behind the checks above.
        if (readSqlState(error) === '23514') throw new SuperAdminTransferRefusedError('WORK_ROLE_HELD');
        throw error;
      }

      const holderRemaining = holderRoles.filter((role) => role !== 'SUPER_ADMIN');
      const events: [string, string, string[], string[]][] = [
        [actor.appUserId, 'SUPER_ADMIN.TRANSFERRED_OUT', holderRoles, holderRemaining],
        [successorAppUserId, 'SUPER_ADMIN.TRANSFERRED_IN', successorRoles, [...successorRoles, 'SUPER_ADMIN']],
      ];
      for (const [appUserId, action, before, after] of events) {
        await this.audit.record(tx, {
          organizationId: organization.id,
          actorKind: 'USER',
          actorAppUserId: actor.appUserId,
          actorRoles: actor.roles,
          action,
          resourceType: 'AppUser',
          resourceId: appUserId,
          before: { roles: before, transferId },
          after: { roles: after, transferId },
          correlationId: transferId,
        });
      }
    });

    return { transferId, from: { appUserId: actor.appUserId }, to: { appUserId: successorAppUserId } };
  }
}
