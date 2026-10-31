import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { renewalDeciderOf } from './decision/renewal-decision.policy';
import type { DeciderRole } from './subscription-renewal.types';

/** The people a renewal concerns, as they hold their roles now (an unlocked read unless a transaction is given). */
export interface RenewalPeople {
  itAdmin: string | null;
  finance: string | null;
  /** The Business Owner while they still work; null once they have left (`BR-06.7`). */
  businessOwner: string | null;
  approver: string | null;
  superAdmin: string | null;
}

/** The roles that read the cases of renewal: the IT Admin who proposes and carries them out, Finance and the decider. */
const READER_ROLES = ['IT_ADMIN', 'FINANCE', 'SPENDING_APPROVER'];

/**
 * Who a renewal concerns (`US-11-01`, `US-11-02`, `US-11-05`): the IT Admin in charge of the department that owns the subscription
 * (any usable IT Admin while that department names none), Finance, the Business Owner, the person who decides spending — or the
 * substitute when that person proposed the case — and the Super Admin. A head of department and an employee are never among them.
 */
@Injectable()
export class RenewalPartiesService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly periods: SubscriptionPeriodApi,
  ) {}

  /** The IT Admin in charge of the owner department, else the first usable IT Admin; null when there is none. */
  async itAdminOf(departmentId: string, tx?: DbTx): Promise<string | null> {
    return (
      (await this.organizationReads.getItAdminInChargeOfDepartment(departmentId, tx)) ??
      (await this.identity.findFirstUsableItAdminEmployeeId(tx))
    );
  }

  /** Who decides a case proposed by this person now, and as which role. */
  async deciderOf(proposerEmployeeId: string, tx?: DbTx): Promise<{ employeeId: string | null; role: DeciderRole }> {
    return renewalDeciderOf(await this.identity.getApprovalRoleHolders(tx), proposerEmployeeId);
  }

  /** Whether the caller reads the cases: one of the roles that work them, or the substitute who may have to decide one. */
  async canRead(actor: AuthenticatedPrincipal): Promise<boolean> {
    if (actor.roles.some((role) => READER_ROLES.includes(role))) return true;

    return (await this.identity.getApprovalRoleHolders()).conflictSubstituteEmployeeId === actor.employeeId;
  }

  /** The people every period shares (Finance, the decider, the Super Admin), read once for a pass. */
  async sharedPeople(): Promise<Pick<RenewalPeople, 'finance' | 'approver' | 'superAdmin'>> {
    const holders = await this.identity.getApprovalRoleHolders();

    return {
      finance: await this.identity.findUsableFinanceEmployeeId(),
      approver: holders.spendingApproverEmployeeId,
      superAdmin: await this.identity.findUsableSuperAdminEmployeeId(),
    };
  }

  /** Everyone a milestone of the period may be sent to: the shared people and those of the period itself. */
  async peopleOf(
    period: { ownerDepartmentId: string; applicationId: string },
    shared: Pick<RenewalPeople, 'finance' | 'approver' | 'superAdmin'>,
  ): Promise<RenewalPeople> {
    return {
      ...shared,
      itAdmin: await this.itAdminOf(period.ownerDepartmentId),
      businessOwner: await this.periods.getRenewalAlertRecipient(period.applicationId),
    };
  }
}
