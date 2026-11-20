import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';

/** The people a renewal concerns, as they hold their roles now (an unlocked read unless a transaction is given). */
export interface RenewalPeople {
  itAdmin: string | null;
  finance: string | null;
  approver: string | null;
  superAdmin: string | null;
}

/** What a reader of the renewals sees: every case (the IT Admin, Finance). */
export type RenewalReadScope = { kind: 'ALL'; itAdmin: boolean };

/**
 * Who a renewal concerns (`US-11-01`, `US-11-05`, `QĐ-103e`, `QĐ-104l`): the IT Admin who answers for the subscription (else any usable IT Admin), Finance, who is told of every result, and the person who decides spending, who
 * hears of an incident only (`QĐ-99h`). Nobody confirms a renewal and no department takes part (`QĐ-113g`).
 */
@Injectable()
export class RenewalPartiesService {
  constructor(private readonly identity: IdentityAccessApi) {}

  /**
   * The IT Admin of the period (`QĐ-113g`, `BB-9`): the one responsible for the subscription while they are a usable IT Admin, else the
   * first usable IT Admin; null when there is none. No department takes part: a subscription has no owning department. The first usable
   * IT Admin is read only when the responsible one is not usable.
   */
  async itAdminOf(period: { responsibleItAdminEmployeeId: string | null }, tx?: DbTx): Promise<string | null> {
    const responsible = period.responsibleItAdminEmployeeId;
    if (
      responsible !== null &&
      (await this.identity.findUsableItAdminEmployeeIds([responsible], tx)).has(responsible)
    ) {
      return responsible;
    }

    return this.identity.findFirstUsableItAdminEmployeeId(tx);
  }

  /**
   * Whether the IT Admin who records stands in for the one responsible for the subscription (`QĐ-104l`, `QĐ-58b`): the one responsible
   * still works as an IT Admin and is someone else. Any IT Admin records; this only tells the audit trail and the notice who answers for it.
   * `responsibleItAdminEmployeeId` is that person while they are usable, else null (nobody to tell, nobody replaced).
   */
  async substituteOf(
    actor: Pick<AuthenticatedPrincipal, 'employeeId'>,
    period: { responsibleItAdminEmployeeId: string | null },
    tx?: DbTx,
  ): Promise<{ substitute: boolean; responsibleItAdminEmployeeId: string | null }> {
    const responsible = period.responsibleItAdminEmployeeId;
    if (responsible === null) return { substitute: false, responsibleItAdminEmployeeId: null };
    const usable = (await this.identity.findUsableItAdminEmployeeIds([responsible], tx)).has(responsible);

    return usable
      ? { substitute: responsible !== actor.employeeId, responsibleItAdminEmployeeId: responsible }
      : { substitute: false, responsibleItAdminEmployeeId: null };
  }

  /** Finance, when they still work: who is told the result of a decision (`QĐ-94d`(2)). */
  financeOf(tx?: DbTx): Promise<string | null> {
    return this.identity.findUsableFinanceEmployeeId(tx);
  }

  /** The person who decides spending, or null: who hears of an incident but of nothing else of a renewal (`QĐ-99h`). */
  approverOf(tx?: DbTx): Promise<string | null> {
    return this.identity.getSpendingApproverEmployeeId(tx);
  }

  /**
   * What the caller reads of the cases: every case for the IT Admin and Finance (Finance only reads), and nothing for anyone else
   * (`SoD-2`): null. No department scope: a subscription has no owning department (`QĐ-113g`).
   */
  readScopeOf(actor: AuthenticatedPrincipal): RenewalReadScope | null {
    if (actor.roles.includes('IT_ADMIN')) return { kind: 'ALL', itAdmin: true };
    if (actor.roles.includes('FINANCE')) return { kind: 'ALL', itAdmin: false };

    return null;
  }

  /** The people every period shares (Finance, the spending approver, the Super Admin), read once for a pass. */
  async sharedPeople(): Promise<Pick<RenewalPeople, 'finance' | 'approver' | 'superAdmin'>> {
    return {
      finance: await this.identity.findUsableFinanceEmployeeId(),
      approver: await this.identity.getSpendingApproverEmployeeId(),
      superAdmin: await this.identity.findUsableSuperAdminEmployeeId(),
    };
  }

  /** Everyone a milestone of the period may be sent to: the shared people and those of the period itself. */
  async peopleOf(
    period: { responsibleItAdminEmployeeId: string | null },
    shared: Pick<RenewalPeople, 'finance' | 'approver' | 'superAdmin'>,
  ): Promise<RenewalPeople> {
    return {
      ...shared,
      itAdmin: await this.itAdminOf(period),
    };
  }
}
