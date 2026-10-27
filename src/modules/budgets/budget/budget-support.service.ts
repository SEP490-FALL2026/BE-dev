import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { formatAmount } from '../../../core/money/money';
import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditEventInput, AuditValue } from '../../audit/audit.types';
import { FinanceService } from '../../finance/finance.service';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { OperatingParametersService } from '../../operating-parameters/operating-parameters.service';
import { OrganizationService } from '../../organization/organization.service';
import {
  BudgetCostCenterNotFoundError,
  BudgetCurrencyError,
  BudgetNotAReaderError,
  BudgetNotYourCostCenterError,
} from './budget.errors';

export interface CostCenterRef {
  id: string;
  code: string;
  name: string;
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

/** The audit event for a change made by `actor`, correlated by their session. */
export function budgetAuditEvent(
  actor: AuthenticatedPrincipal,
  organizationId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  after: { [key: string]: AuditValue },
): AuditEventInput {
  return {
    organizationId,
    actorKind: 'USER',
    actorAppUserId: actor.appUserId,
    actorRoles: actor.roles,
    action,
    resourceType,
    resourceId,
    before: null,
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
export class BudgetSupportService {
  constructor(
    private readonly organization: OrganizationService,
    private readonly finance: FinanceService,
    private readonly parameters: OperatingParametersService,
    private readonly identity: IdentityAccessService,
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

  /** Throws BudgetNotAReaderError: Finance, the spending approver and the substitute read the versions; nobody else does. */
  async requireVersionReader(actor: AuthenticatedPrincipal): Promise<void> {
    if (actor.roles.includes('FINANCE') || (await this.isDecider(actor.employeeId))) return;

    throw new BudgetNotAReaderError();
  }

  /** The month the fiscal year begins in; read before a transaction opens. */
  async fiscalYearStartMonth(): Promise<number> {
    return Number(await this.parameters.getValue('FISCAL_YEAR_START_MONTH'));
  }

  today(now: Date, tx?: DbTx): Promise<BusinessDate> {
    return this.organization.businessToday(now, tx);
  }

  async organizationId(tx?: DbTx): Promise<string> {
    const organization = await this.organization.getOrganization(tx);
    if (!organization) throw new Error('The installation has no organization.');

    return organization.id;
  }

  async reportingCurrency(tx?: DbTx): Promise<string> {
    const organization = await this.organization.getOrganization(tx);
    if (!organization) throw new Error('The installation has no organization.');

    return organization.reportingCurrency;
  }

  /** Throws BudgetCostCenterNotFoundError: a budget is kept for a Unit, the Cost Center a department is charged to. */
  async costCenter(id: string, tx?: DbTx): Promise<CostCenterRef> {
    const [found] = await this.organization.costCentersByIds([id], tx);
    if (!found || found.kind !== 'UNIT') throw new BudgetCostCenterNotFoundError();

    return { id: found.id, code: found.code, name: found.name };
  }

  /**
   * The Cost Center whose department the person heads today, or null: only the head of a department answers for the
   * Cost Center of that department (`US-06-10` AC-3).
   */
  async headedCostCenter(employeeId: string, today: BusinessDate, tx?: DbTx): Promise<string | null> {
    const headed = await this.organization.getHeadedDepartment(employeeId, today);
    if (!headed) return null;
    const unit = (await this.organization.getOwningUnits([employeeId], today, tx)).get(employeeId);

    // A department with no Cost Center in use has nothing a head could answer for (`QĐ-87d(1)`).
    return unit && unit.departmentId === headed.departmentId ? (unit.costCenter?.id ?? null) : null;
  }

  /** Throws BudgetNotYourCostCenterError. */
  async requireHead(employeeId: string, costCenterId: string, today: BusinessDate, tx?: DbTx): Promise<void> {
    if ((await this.headedCostCenter(employeeId, today, tx)) !== costCenterId) throw new BudgetNotYourCostCenterError();
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
    const found = wanted.length === 0 ? [] : await this.organization.getEmployees(wanted);

    return new Map(
      found.map((employee) => [
        employee.id,
        { employeeId: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName },
      ]),
    );
  }

  async costCenters(ids: readonly string[]): Promise<Map<string, CostCenterRef>> {
    const found = ids.length === 0 ? [] : await this.organization.costCentersByIds([...new Set(ids)]);

    return new Map(found.map((center) => [center.id, { id: center.id, code: center.code, name: center.name }]));
  }
}
