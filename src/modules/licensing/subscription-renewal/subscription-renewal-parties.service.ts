import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { renewalDeciderOf } from './decision/renewal-decision.policy';
import { renewalNamedItAdminOf } from './renewal-it-admin.policy';
import type { DeciderRole } from './subscription-renewal.types';

/** The people a renewal concerns, as they hold their roles now (an unlocked read unless a transaction is given). */
export interface RenewalPeople {
  itAdmin: string | null;
  finance: string | null;
  approver: string | null;
  superAdmin: string | null;
}

/** What a reader of the renewals sees: every case (the IT Admin, Finance), or those of the department that owns the subscription. */
export type RenewalReadScope = { kind: 'ALL'; itAdmin: boolean } | { kind: 'DEPARTMENT'; departmentId: string };

/**
 * Who a renewal concerns (`US-11-01`, `US-11-05`, `QĐ-94d`(2)): the IT Admin in charge of the department that owns the subscription
 * (any usable IT Admin while that department names none or theirs is not usable), Finance, the head of the owner department — who
 * confirms the proposal on the day of the decision, whatever role their account holds, and nobody in their place — and the Super
 * Admin. The person who decides spending is no longer among those who decide a renewal, but still hears of an incident
 * (`QĐ-98f`).
 */
@Injectable()
export class RenewalPartiesService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /**
   * The IT Admin of the period (`QĐ-111g`, `BB-9`): the one responsible for the subscription while they are a usable IT Admin, else the IT
   * Admin in charge of the owner department while they are one too, else the first usable IT Admin; null when there is none. The
   * department is read first and both named are tested in ONE read; the first usable IT Admin is read only when neither is usable.
   */
  async itAdminOf(
    period: { ownerDepartmentId: string; responsibleItAdminEmployeeId: string | null },
    tx?: DbTx,
  ): Promise<string | null> {
    const inCharge = await this.organizationReads.getItAdminInChargeOfDepartment(period.ownerDepartmentId, tx);
    const named = [...new Set([period.responsibleItAdminEmployeeId, inCharge].filter((id) => id !== null))];
    const usable = await this.identity.findUsableItAdminEmployeeIds(named, tx);

    return (
      renewalNamedItAdminOf({
        responsibleItAdminEmployeeId: period.responsibleItAdminEmployeeId,
        departmentItAdminEmployeeId: inCharge,
        usableItAdminEmployeeIds: usable,
      }) ?? (await this.identity.findFirstUsableItAdminEmployeeId(tx))
    );
  }

  /** The person assigned head of the department on `today`, or null: the department names none, or its head period has not begun. */
  async ownerHeadOf(departmentId: string, today: BusinessDate, tx?: DbTx): Promise<string | null> {
    return (
      (await this.organizationReads.getDepartmentHeads([departmentId], today, tx)).get(departmentId)?.employeeId ?? null
    );
  }

  /** The heads of these departments on `today`, by department id (a department with none is absent): one read for a page. */
  async ownerHeadsOf(departmentIds: readonly string[], today: BusinessDate, tx?: DbTx): Promise<Map<string, string>> {
    const heads = await this.organizationReads.getDepartmentHeads([...new Set(departmentIds)], today, tx);

    return new Map([...heads].map(([departmentId, head]) => [departmentId, head.employeeId]));
  }

  /** The Super Admin of today, whatever the state of their account, or null: who is told that a case waits for a head. */
  async superAdminOf(tx?: DbTx): Promise<string | null> {
    return (await this.identity.getSuperAdminHolder(tx))?.employeeId ?? null;
  }

  /** Finance, when they still work: who is told the result of a decision (`QĐ-94d`(2)). */
  financeOf(tx?: DbTx): Promise<string | null> {
    return this.identity.findUsableFinanceEmployeeId(tx);
  }

  /** Who confirms a case proposed by this person now: the head of the owner department, and nobody in their place. */
  async deciderOf(
    ownerDepartmentId: string,
    proposerEmployeeId: string,
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<{ employeeId: string | null; role: Extract<DeciderRole, 'OWNER_DEPARTMENT_HEAD'> }> {
    return renewalDeciderOf(await this.ownerHeadOf(ownerDepartmentId, today, tx), proposerEmployeeId);
  }

  /**
   * What the caller reads of the cases: every case for the IT Admin and Finance (Finance only reads), those of the department the
   * caller heads today for a head (whatever role their account holds), and nothing for anyone else (`SoD-2`): null.
   */
  async readScopeOf(actor: AuthenticatedPrincipal, today: BusinessDate): Promise<RenewalReadScope | null> {
    if (actor.roles.includes('IT_ADMIN')) return { kind: 'ALL', itAdmin: true };
    if (actor.roles.includes('FINANCE')) return { kind: 'ALL', itAdmin: false };
    // The head of today reads the cases of their department whatever role their account holds: the one who confirms must be able to read.
    const headed = await this.organizationReads.getHeadedDepartment(actor.employeeId, today);

    return headed ? { kind: 'DEPARTMENT', departmentId: headed.departmentId } : null;
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
    period: { ownerDepartmentId: string; responsibleItAdminEmployeeId: string | null },
    shared: Pick<RenewalPeople, 'finance' | 'approver' | 'superAdmin'>,
  ): Promise<RenewalPeople> {
    return {
      ...shared,
      itAdmin: await this.itAdminOf(period),
    };
  }
}
