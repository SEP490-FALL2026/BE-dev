import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { RequestPartyEligibilityApi } from '../../../identity-access/public/request-party-eligibility.api';
import { EmployeeNotFoundError } from '../../../organization/public/organization.errors';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
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
    private readonly organizationReads: OrganizationReadApi,
    private readonly frame: ProvisioningTaskFrame,
    private readonly requestParties: RequestPartyEligibilityApi,
  ) {}

  /**
   * Throws EmployeeNotFoundError, ProvisioningBeneficiaryDepartedError, ProvisioningBeneficiaryNotStartedError,
   * ProvisioningPersonalAccountError and ProvisioningAnotherItAdminNeededError (an IT Admin does not queue the grant of their own
   * request while another usable IT Admin can, `QĐ-77m`).
   */
  async personal(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { requestId: string; employeeId: string; accountIdentifier: string | undefined; today: BusinessDate },
  ): Promise<GrantHolder> {
    await this.organizationReads.lockEmployeeForShare(tx, input.employeeId);
    const employee = await this.organizationReads.getEmployee(input.employeeId, tx);
    if (!employee || employee.status !== 'ACTIVE') throw new ProvisioningBeneficiaryDepartedError(input.requestId);
    if (employee.hireDate > input.today) {
      throw new ProvisioningBeneficiaryNotStartedError(input.requestId, employee.hireDate);
    }

    const mode = await this.frame.selfExecutionMode(actor, input.employeeId, tx);

    return {
      employeeId: input.employeeId,
      accountIdentifier: chooseAccount({
        workEmail: employee.workEmail,
        requested: input.accountIdentifier,
        companyDomains: await this.organizationReads.getCompanyEmailDomains(tx),
      }),
      kind: 'PERSONAL',
      reason: null,
      costCenterId: null,
      owningDepartmentId: null,
      // Only an IT Admin who grants their own request is marked; for anybody else the rule does not apply.
      selfExecuted: actor.employeeId === input.employeeId ? mode === 'ALLOW_SELF_EXECUTED' : null,
    };
  }

  /**
   * `named` is the person the IT Admin chose in the place of the one the request names. Throws
   * ProvisioningResponsibleNotInDepartmentError (the one the request names is not there any more),
   * ProvisioningResponsibleInvalidError (the one the IT Admin named is not there), RequestPartyIneligibleError (the one the IT Admin
   * named is the spending approver, `D-S21`) and ProvisioningAnotherItAdminNeededError.
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
    const problem = await this.problemWith(tx, employeeId, account.departmentId, input.today, {
      judgeParty: input.named !== undefined,
    });
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

  /**
   * Why the person cannot answer for an account of the department, or null; the person is locked `FOR SHARE` when they exist. A person
   * the IT Admin names (`judgeParty`) who cannot be a party of a Request is refused after that lock and before any state or department
   * is read; the person the request names was judged when it was sent.
   */
  private async problemWith(
    tx: DbTx,
    employeeId: string,
    departmentId: string,
    today: BusinessDate,
    options: { judgeParty: boolean },
  ): Promise<'NOT_FOUND' | 'NOT_ACTIVE' | 'OUTSIDE_DEPARTMENT' | null> {
    try {
      await this.organizationReads.lockEmployeeForShare(tx, employeeId);
    } catch (error) {
      if (error instanceof EmployeeNotFoundError) return 'NOT_FOUND';
      throw error;
    }
    if (options.judgeParty) {
      await this.requestParties.assertEligible(tx, { requesterEmployeeId: null, beneficiaryEmployeeIds: [employeeId] });
    }
    const employee = await this.organizationReads.getEmployee(employeeId, tx);
    if (!employee || employee.status !== 'ACTIVE') return 'NOT_ACTIVE';
    const unit = (await this.organizationReads.getOwningUnits([employeeId], today, tx)).get(employeeId);

    return unit?.departmentId === departmentId ? null : 'OUTSIDE_DEPARTMENT';
  }
}
