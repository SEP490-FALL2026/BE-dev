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
 * (any usable IT Admin while that department names none), Finance, the Business Owner, the person who decides spending — and nobody
 * in their place (`QĐ-93d`(1)) — and the Super Admin. A head of department and an employee are never among them.
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

  /**
   * The spending approver, when they still work: who decides the cases now, and nobody else does (`QĐ-93d`(1)). Null when nobody holds
   * the role or the holder has left, which is what a case that waits for its decision waits for. With `forShare`, in the transaction
   * `tx`, the row of the grant is locked until it ends, so a case that starts to wait and a revocation take turns (`M6`).
   */
  async usableApproverOf(tx?: DbTx, options?: { forShare?: boolean }): Promise<string | null> {
    const holder = await this.identity.getSpendingApproverEmployeeId(tx, options);
    if (holder === null) return null;
    const [found] = await this.organizationReads.getEmployees([holder], tx);

    return found?.status === 'ACTIVE' ? holder : null;
  }

  /** Who decides a case proposed by this person now: the spending approver, and nobody in their place. */
  async deciderOf(
    proposerEmployeeId: string,
    tx?: DbTx,
  ): Promise<{ employeeId: string | null; role: Extract<DeciderRole, 'SPENDING_APPROVER'> }> {
    return renewalDeciderOf(await this.usableApproverOf(tx), proposerEmployeeId);
  }

  /** Whether the caller reads the cases: one of the roles that work them; the substitute for a conflict has no part in them any more. */
  canRead(actor: AuthenticatedPrincipal): boolean {
    return actor.roles.some((role) => READER_ROLES.includes(role));
  }

  /** The people every period shares (Finance, the decider, the Super Admin), read once for a pass. */
  async sharedPeople(): Promise<Pick<RenewalPeople, 'finance' | 'approver' | 'superAdmin'>> {
    return {
      finance: await this.identity.findUsableFinanceEmployeeId(),
      approver: await this.identity.getSpendingApproverEmployeeId(),
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
