import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { EmployeeNotFoundError } from '../../../organization/public/organization.errors';
import { OrganizationApi } from '../../../organization/public/organization.api';
import {
  ProvisioningBeneficiaryDepartedError,
  ProvisioningBeneficiaryNotStartedError,
  ProvisioningResponsibleInvalidError,
  ProvisioningResponsibleNotInDepartmentError,
} from '../../public/licensing.errors';
import type { AssignmentHolder, ServiceAccountGrant } from '../../public/licensing.types';
import { chooseAccount } from '../provisioning.policy';
import { ProvisioningTaskFrame } from '../provisioning-task-frame.service';

/** The holder of the assignment of a grant, and whether the IT Admin who grants answers for it themselves (null: the rule does not apply). */
export interface GrantHolder extends AssignmentHolder {
  selfExecuted: boolean | null;
}

/**
 * The holder of the seat of a grant, judged inside the transaction of the grant while the person is held `FOR SHARE`, so that
 * they cannot leave meanwhile. A personal seat belongs to the beneficiary of the request, under a company account. A service
 * account belongs to the department of the request and is answered for by a person of that department: the one the request
 * names, or the one the IT Admin names instead when they moved while the request was open (`QĐ-86c`).
 */
@Injectable()
export class ProvisioningHolderService {
  constructor(
    private readonly organization: OrganizationApi,
    private readonly frame: ProvisioningTaskFrame,
  ) {}

  /** Throws EmployeeNotFoundError, ProvisioningBeneficiaryDepartedError, ProvisioningBeneficiaryNotStartedError and ProvisioningPersonalAccountError. */
  async personal(
    tx: DbTx,
    input: { requestId: string; employeeId: string; accountIdentifier: string | undefined; today: BusinessDate },
  ): Promise<GrantHolder> {
    await this.organization.lockEmployeeForShare(tx, input.employeeId);
    const employee = await this.organization.getEmployee(input.employeeId, tx);
    if (!employee || employee.status !== 'ACTIVE') throw new ProvisioningBeneficiaryDepartedError(input.requestId);
    if (employee.hireDate > input.today) {
      throw new ProvisioningBeneficiaryNotStartedError(input.requestId, employee.hireDate);
    }

    return {
      employeeId: input.employeeId,
      accountIdentifier: chooseAccount({
        workEmail: employee.workEmail,
        requested: input.accountIdentifier,
        companyDomains: await this.organization.getCompanyEmailDomains(tx),
      }),
      kind: 'PERSONAL',
      reason: null,
      costCenterId: null,
      owningDepartmentId: null,
      selfExecuted: null,
    };
  }

  /**
   * `named` is the person the IT Admin chose in the place of the one the request names. Throws
   * ProvisioningResponsibleNotInDepartmentError (the one the request names is not there any more),
   * ProvisioningResponsibleInvalidError (the one the IT Admin named is not there) and ProvisioningAnotherItAdminNeededError.
   */
  async service(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      requested: { employeeId: string; account: ServiceAccountGrant };
      named: string | undefined;
      accountIdentifier: string;
      today: BusinessDate;
    },
  ): Promise<GrantHolder> {
    const { account } = input.requested;
    const employeeId = input.named ?? input.requested.employeeId;
    const problem = await this.problemWith(tx, employeeId, account.departmentId, input.today);
    if (problem) {
      throw input.named === undefined
        ? new ProvisioningResponsibleNotInDepartmentError()
        : new ProvisioningResponsibleInvalidError(problem);
    }
    const mode = await this.frame.selfExecutionMode(actor, employeeId, tx);

    return {
      employeeId,
      accountIdentifier: input.accountIdentifier,
      kind: 'SERVICE',
      reason: account.purpose,
      costCenterId: account.costCenterId,
      owningDepartmentId: account.departmentId,
      selfExecuted: mode === 'ALLOW_SELF_EXECUTED',
    };
  }

  /** Why the person cannot answer for an account of the department, or null; the person is locked `FOR SHARE` when they exist. */
  private async problemWith(
    tx: DbTx,
    employeeId: string,
    departmentId: string,
    today: BusinessDate,
  ): Promise<'NOT_FOUND' | 'NOT_ACTIVE' | 'OUTSIDE_DEPARTMENT' | null> {
    try {
      await this.organization.lockEmployeeForShare(tx, employeeId);
    } catch (error) {
      if (error instanceof EmployeeNotFoundError) return 'NOT_FOUND';
      throw error;
    }
    const employee = await this.organization.getEmployee(employeeId, tx);
    if (!employee || employee.status !== 'ACTIVE') return 'NOT_ACTIVE';
    const unit = (await this.organization.getOwningUnits([employeeId], today, tx)).get(employeeId);

    return unit?.departmentId === departmentId ? null : 'OUTSIDE_DEPARTMENT';
  }
}
