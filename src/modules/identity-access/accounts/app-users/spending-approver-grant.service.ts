import { Inject, Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { AccountRecord } from '../../public/identity-access.types';
import {
  SpendingApproverAccountNotUsableError,
  SpendingApproverAlreadyAssignedError,
  SpendingApproverEmployeeNotActiveError,
  SpendingApproverHasOpenWorkError,
  SpendingApproverHeadsDepartmentError,
  SpendingApproverIsSubstituteError,
} from '../account.errors';
import { APPROVAL_ROLE_HOLDINGS, ApprovalRoleHoldings } from '../account.types';
import { RoleGrantService } from '../role-grant.service';
import { accountIsUsable, canBeSpendingApprover } from './account-administration.policy';
import { SpendingApproverBlockersService } from './spending-approver-blockers.service';

/**
 * Rules 6 to 10 of the grant of SPENDING_APPROVER, in the order of the spec (rules 1 to 5 are the same for every role and stay with the
 * grant). Called in the transaction of the grant after the advisory key of the approval roles, the employee and the account were locked,
 * so each reads what the last writer committed.
 */
@Injectable()
export class SpendingApproverGrantService {
  constructor(
    private readonly grants: RoleGrantService,
    private readonly organizationReads: OrganizationReadApi,
    @Inject(APPROVAL_ROLE_HOLDINGS) private readonly approvalRoles: ApprovalRoleHoldings,
    private readonly openWork: SpendingApproverBlockersService,
  ) {}

  async check(tx: DbTx, account: AccountRecord): Promise<void> {
    if (await this.grants.spendingApproverIsHeld(tx, account.organizationId)) {
      throw new SpendingApproverAlreadyAssignedError();
    }
    const employee = await this.organizationReads.getEmployee(account.employeeId, tx);
    if (!employee || !canBeSpendingApprover(employee)) throw new SpendingApproverEmployeeNotActiveError();
    if (!accountIsUsable(account)) throw new SpendingApproverAccountNotUsableError();
    const periods = await this.organizationReads.headPeriodsFrom(account.employeeId, undefined, tx);
    if (periods.length > 0) throw new SpendingApproverHeadsDepartmentError(periods);
    if ((await this.approvalRoles.rolesHeldBy(tx, account.employeeId)).includes('CONFLICT_SUBSTITUTE')) {
      throw new SpendingApproverIsSubstituteError();
    }
    // The account is locked FOR UPDATE: a Request the person is sending now either committed (and is seen here) or waits for this grant.
    const open = await this.openWork.of(tx, account.employeeId);
    if (open.blockers.length > 0) throw new SpendingApproverHasOpenWorkError(open.blockers, open.truncated);
  }
}
