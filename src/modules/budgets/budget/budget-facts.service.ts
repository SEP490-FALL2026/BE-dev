import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { formatAmount } from '../../../core/money/money';
import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditEventInput, AuditValue } from '../../audit/public/audit.types';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { FinanceApi } from '../../finance/public/finance.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  BudgetCostCenterNotFoundError,
  BudgetCurrencyError,
  BudgetNotAReaderError,
  BudgetNotFinanceError,
  BudgetNotYourCostCenterError,
  BudgetPlanNotFoundError,
} from './budget.errors';

export interface CostCenterRef {
  id: string;
  code: string;
  name: string;
}

/** The department a person heads and the Cost Center it is charged to, which is none while Finance has not made one for it. */
export interface HeadedUnit {
  departmentId: string;
  costCenter: { id: string; inUse: boolean } | null;
}

export interface EmployeeRef {
  employeeId: string;
  employeeCode: string;
  fullName: string;
}

export interface MoneyView {
  amount: string;
  currency: string;
}

/** The audit event for a change made by `actor`, correlated by their session; `before` is what the change replaced. */
export function budgetAuditEvent(
  actor: AuthenticatedPrincipal,
  organizationId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  after: { [key: string]: AuditValue },
  before: { [key: string]: AuditValue } | null = null,
): AuditEventInput {
  return {
    organizationId,
    actorKind: 'USER',
    actorAppUserId: actor.appUserId,
    actorRoles: actor.roles,
    action,
    resourceType,
    resourceId,
    before,
    after,
    correlationId: actor.sessionId,
  };
}

/**
 * What the proposals and versions of a budget read from the organization and the finance context: the fiscal year, the
 * reporting currency every budget is kept in, the Cost Center the head of a department answers for, and the way money and
 * people are written for a reader. It decides nothing: the policies and the services do.
 */
@Injectable()
export class BudgetFactsService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly finance: FinanceApi,
    private readonly parameters: OperatingParametersApi,
    private readonly identity: IdentityAccessApi,
    private readonly catalog: CatalogApi,
  ) {}

  /** Whether the person holds the role of the spending approver now: who decides the versions of a budget. */
  async isSpendingApprover(employeeId: string, tx?: DbTx): Promise<boolean> {
    return (await this.identity.getApprovalRoleHolders(tx)).spendingApproverEmployeeId === employeeId;
  }

  /** Who holds the roles that decide a budget now: the spending approver and the substitute for a conflict. */
  holders(tx?: DbTx) {
    return this.identity.getApprovalRoleHolders(tx);
  }

  /** Whether the person is the spending approver or the substitute: the two who read what is to be decided. */
  async isDecider(employeeId: string, tx?: DbTx): Promise<boolean> {
    const holders = await this.holders(tx);

    return holders.spendingApproverEmployeeId === employeeId || holders.conflictSubstituteEmployeeId === employeeId;
  }

  /** Throws BudgetNotFinanceError: what Finance builds is Finance's, whatever route it was reached by. */
  requireFinance(actor: AuthenticatedPrincipal): void {
    if (!actor.roles.includes('FINANCE')) throw new BudgetNotFinanceError();
  }

  /** Throws BudgetNotAReaderError: Finance, the spending approver and the substitute read the versions; nobody else does. */
  async requireVersionReader(actor: AuthenticatedPrincipal): Promise<void> {
    if (actor.roles.includes('FINANCE') || (await this.isDecider(actor.employeeId))) return;

    throw new BudgetNotAReaderError();
  }

  /** Throws BudgetPlanNotFoundError when a line names a plan the catalog does not have: a line points at a plan, it never makes one. */
  async requirePlans(planIds: readonly (string | null | undefined)[]): Promise<void> {
    const wanted = [...new Set(planIds.filter((id): id is string => typeof id === 'string'))];
    if (wanted.length === 0) return;
    const found = new Set((await this.catalog.getPlanSummaries(wanted)).map((plan) => plan.planId));
    const missing = wanted.filter((id) => !found.has(id));
    if (missing.length > 0) throw new BudgetPlanNotFoundError(missing);
  }

  /** The month the fiscal year begins in; read before a transaction opens. */
  async fiscalYearStartMonth(): Promise<number> {
    return Number(await this.parameters.getValue('FISCAL_YEAR_START_MONTH'));
  }

  /** The month the fiscal year begins in, kept from changing until `tx` ends: read by what makes the first version of a budget. */
  async holdFiscalYearStartMonth(tx: DbTx): Promise<number> {
    return Number(await this.parameters.holdValue(tx, 'FISCAL_YEAR_START_MONTH'));
  }

  today(now: Date, tx?: DbTx): Promise<BusinessDate> {
    return this.organizationReads.businessToday(now, tx);
  }

  async organizationId(tx?: DbTx): Promise<string> {
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('The installation has no organization.');

    return organization.id;
  }

  async reportingCurrency(tx?: DbTx): Promise<string> {
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('The installation has no organization.');

    return organization.reportingCurrency;
  }

  /** Throws BudgetCostCenterNotFoundError: a budget is kept for a Unit, the Cost Center a department is charged to. */
  async costCenter(id: string, tx?: DbTx): Promise<CostCenterRef> {
    const [found] = await this.organizationReads.costCentersByIds([id], tx);
    if (!found || found.kind !== 'UNIT') throw new BudgetCostCenterNotFoundError();

    return { id: found.id, code: found.code, name: found.name };
  }

  /**
   * The Cost Center of a budget that is still in use, with the department it belongs to. Throws BudgetCostCenterNotFoundError, and
   * FinanceSetupIncompleteError when the Cost Center was retired, so the department has none in use (`QĐ-87d(1)`).
   */
  async costCenterInUse(id: string, tx?: DbTx): Promise<CostCenterRef & { departmentId: string }> {
    const [found] = await this.organizationReads.costCentersByIds([id], tx);
    if (!found || found.kind !== 'UNIT') throw new BudgetCostCenterNotFoundError();
    if (found.status !== 'ACTIVE') throw new FinanceSetupIncompleteError(found.departmentId);

    return { id: found.id, code: found.code, name: found.name, departmentId: found.departmentId };
  }

  /** The department the person heads today with its Cost Center, or null when they head none. */
  async headedUnit(employeeId: string, today: BusinessDate, tx?: DbTx): Promise<HeadedUnit | null> {
    const headed = await this.organizationReads.getHeadedDepartment(employeeId, today);
    if (!headed) return null;
    const unit = (await this.organizationReads.getOwningUnits([employeeId], today, tx)).get(employeeId);
    if (!unit || unit.departmentId !== headed.departmentId) return null;

    return {
      departmentId: unit.departmentId,
      costCenter: unit.costCenter ? { id: unit.costCenter.id, inUse: unit.costCenter.status === 'ACTIVE' } : null,
    };
  }

  /**
   * The Cost Center whose department the person heads today, or null: only the head of a department answers for the
   * Cost Center of that department (`US-06-10` AC-3).
   */
  async headedCostCenter(employeeId: string, today: BusinessDate, tx?: DbTx): Promise<string | null> {
    return (await this.headedUnit(employeeId, today, tx))?.costCenter?.id ?? null;
  }

  /**
   * The Cost Center the person answers for as the head of its department. Throws BudgetNotYourCostCenterError when they head no
   * department, and FinanceSetupIncompleteError when the department has no Cost Center in use yet: that is told before
   * anything else is looked at, because the head cannot propose until Finance has made one.
   */
  async requireHeadedCostCenter(employeeId: string, today: BusinessDate, tx?: DbTx): Promise<string> {
    const unit = await this.headedUnit(employeeId, today, tx);
    if (unit === null) throw new BudgetNotYourCostCenterError();
    if (unit.costCenter === null || !unit.costCenter.inUse) throw new FinanceSetupIncompleteError(unit.departmentId);

    return unit.costCenter.id;
  }

  /**
   * Whether the person heads a department that has no Cost Center in use and the Cost Center is one that department had: the head
   * still owns what was sent for it, and `send` tells them the setup is incomplete instead of that the proposal does not exist.
   */
  async headsDepartmentWithNoneInUse(
    employeeId: string,
    costCenterId: string,
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<boolean> {
    const unit = await this.headedUnit(employeeId, today, tx);
    if (unit === null || unit.costCenter !== null) return false;
    const [found] = await this.organizationReads.costCentersByIds([costCenterId], tx);

    return found?.departmentId === unit.departmentId;
  }

  /** Throws BudgetNotYourCostCenterError. */
  async requireHead(employeeId: string, costCenterId: string, today: BusinessDate, tx?: DbTx): Promise<void> {
    if ((await this.headedCostCenter(employeeId, today, tx)) !== costCenterId) throw new BudgetNotYourCostCenterError();
  }

  /** Who heads the department today, or null when nobody does (`QĐ-92d(1)`). */
  async currentHeadOf(departmentId: string, today: BusinessDate, tx?: DbTx): Promise<string | null> {
    return (
      (await this.organizationReads.getDepartmentHeads([departmentId], today, tx)).get(departmentId)?.employeeId ?? null
    );
  }

  /**
   * The same, for a notice that is KEPT when nobody heads the department (rows 53 and 55): the department is taken `FOR SHARE`
   * before the head is read, in this transaction. The assignment of a head takes it `FOR UPDATE` and hands over what was kept before it
   * commits, so a writer either commits its kept notice before the assignment hands over, or waits and then reads the new head and
   * tells them directly: no notice is left undelivered for a department that has a head. Departments are never locked before budget
   * rows by a budget path, and the assignment never waits for a budget row, so this cannot invert a lock order.
   */
  async currentHeadOfLocked(departmentId: string, today: BusinessDate, tx: DbTx): Promise<string | null> {
    await this.organizationReads.lockDepartmentShared(tx, departmentId);

    return this.currentHeadOf(departmentId, today, tx);
  }

  /** The Finance employee who can act now, or null: who is told of the proposals and of the budget that closes. */
  financeEmployeeId(tx?: DbTx): Promise<string | null> {
    return this.identity.findUsableFinanceEmployeeId(tx);
  }

  /** The department of each Cost Center, for the notices that reach the head of a department. */
  async departmentsOf(costCenterIds: readonly string[], tx?: DbTx): Promise<Map<string, string>> {
    const found =
      costCenterIds.length === 0 ? [] : await this.organizationReads.costCentersByIds([...new Set(costCenterIds)], tx);

    return new Map(found.map((center) => [center.id, center.departmentId]));
  }

  /** Reads an amount in whole minor units. Throws the money errors, and BudgetCurrencyError for any currency but the reporting one. */
  async money(input: { amount: string; currency: string }, reporting: string, tx?: DbTx): Promise<bigint> {
    const parsed = await this.finance.parseMoney(input, tx);
    if (parsed.currency !== reporting) throw new BudgetCurrencyError(parsed.currency, reporting);
    // A budget never holds a negative amount.
    if (parsed.amountMinor < 0n) throw new MoneyOutOfRangeError();

    return parsed.amountMinor;
  }

  /** `money` for a threshold: it must be more than nothing, since a threshold of nothing would flag every line. */
  async positiveMoney(input: { amount: string; currency: string }, reporting: string, tx?: DbTx): Promise<bigint> {
    const minor = await this.money(input, reporting, tx);
    if (minor <= 0n) throw new MoneyOutOfRangeError();

    return minor;
  }

  async formatter(currency: string): Promise<(minor: bigint) => MoneyView> {
    const units = (await this.finance.findCurrency(currency))?.minorUnit ?? 2;

    return (minor) => ({ amount: formatAmount(minor, units), currency });
  }

  async people(ids: readonly (string | null)[]): Promise<Map<string, EmployeeRef>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    const found = wanted.length === 0 ? [] : await this.organizationReads.getEmployees(wanted);

    return new Map(
      found.map((employee) => [
        employee.id,
        { employeeId: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName },
      ]),
    );
  }

  async costCenters(ids: readonly string[]): Promise<Map<string, CostCenterRef>> {
    const found = ids.length === 0 ? [] : await this.organizationReads.costCentersByIds([...new Set(ids)]);

    return new Map(found.map((center) => [center.id, { id: center.id, code: center.code, name: center.name }]));
  }
}
