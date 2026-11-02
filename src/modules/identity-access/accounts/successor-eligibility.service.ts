import { Inject, Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccountRecordService } from './account-record.service';
import { APPROVAL_ROLE_HOLDINGS, ApprovalRoleHoldings } from './account.types';
import { RoleGrantService } from './role-grant.service';

export type SuccessorProblem =
  | 'SUCCESSOR_NOT_FOUND'
  | 'ACCOUNT_LOCKED'
  | 'EMPLOYEE_NOT_WORKING'
  | 'NOT_ACTIVATED'
  | 'EMAIL_NOT_VERIFIED'
  | 'WORK_ROLE_HELD'
  | 'APPROVAL_ROLE_HELD'
  | 'HEADS_DEPARTMENT'
  | 'MANAGER_HELD';

/** How a login email was confirmed, for the ones that prove the person owns it (QĐ-46; BOOTSTRAP_ASSERTED is only a claim). */
const ACCEPTED_EMAIL_VERIFICATION = new Set(['INVITATION_REDEEMED', 'RECOVERY_VERIFIED']);

/**
 * Whether an account can receive the Super Admin role (`US-01-09` AC-3, AC-12): working, activated with a verified
 * email, holding no IT Admin or Finance role, no approval role, and not heading a department (`FR-8.7`). Both the
 * transfer by the holder and the recovery by an operator ask this one question, so they cannot disagree about it.
 * The caller holds the successor's locks; this reads, in statements of their own, what those locks protect.
 */
@Injectable()
export class SuccessorEligibility {
  constructor(
    private readonly accounts: AccountRecordService,
    private readonly grants: RoleGrantService,
    @Inject(APPROVAL_ROLE_HOLDINGS) private readonly approvalRoles: ApprovalRoleHoldings,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** The first reason the account cannot take the role, or null when it can. */
  async check(tx: DbTx, successorAppUserId: string): Promise<SuccessorProblem | null> {
    const successor = await this.accounts.readAccount(tx, successorAppUserId);
    if (!successor) return 'SUCCESSOR_NOT_FOUND';
    if (successor.status !== 'ACTIVE') return 'ACCOUNT_LOCKED';

    const employee = await this.organizationReads.getEmployee(successor.employeeId, tx);
    // Only a person who is working qualifies: one who has left, and later one on long leave or in hand-over, is any
    // other status (G6 adds them), so this refuses them without being rewritten.
    if (!employee || employee.status !== 'ACTIVE') return 'EMPLOYEE_NOT_WORKING';
    if (successor.activationState !== 'ACTIVATED') return 'NOT_ACTIVATED';

    const verification = await this.accounts.readEmailVerificationSource(tx, successorAppUserId);
    if (verification === null || !ACCEPTED_EMAIL_VERIFICATION.has(verification)) return 'EMAIL_NOT_VERIFIED';

    const roles = await this.grants.effectiveRoles(successorAppUserId, tx);
    if (roles.includes('IT_ADMIN') || roles.includes('FINANCE')) return 'WORK_ROLE_HELD';
    if ((await this.approvalRoles.rolesHeldBy(tx, successor.employeeId)).length > 0) return 'APPROVAL_ROLE_HELD';
    if (await this.organizationReads.isDepartmentHead(successor.employeeId, tx)) return 'HEADS_DEPARTMENT';
    if (roles.includes('MANAGER')) return 'MANAGER_HELD';

    return null;
  }
}
