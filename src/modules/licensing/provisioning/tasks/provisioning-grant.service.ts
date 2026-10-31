import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { ProvisioningTaskViewService, type TaskView } from '../provisioning-task-view.service';
import { ProvisioningGrantPlanner, type GrantInput } from './provisioning-grant-planner.service';
import { grantWarnings } from './provisioning-grant.policy';
import { ProvisioningGrantWriter } from './provisioning-grant-writer.service';

/**
 * Grants the seat of a request: the assignment (source REQUEST, from today) and a manual task in the queue of the IT Admin in charge of
 * the department of whoever holds it. A personal seat is the beneficiary's, under a company account; a service account (`US-05-21`) is
 * answered for by a person of the department that owns it, under the identifier the IT Admin enters. The seat goes only on a subscription of
 * the department of the request, which owns it and is charged for it (`QĐ-89a`). Throws ProvisioningItAdminRequiredError,
 * GrantRequestRefusedError, SeatTargetNotFoundError, ProvisioningTypeNotSupportedError, ProvisioningSubscriptionError,
 * SeatQuantityUnknownError, EmployeeNotFoundError, ProvisioningBeneficiaryDepartedError, ProvisioningBeneficiaryNotStartedError,
 * ProvisioningPersonalAccountError, ProvisioningAccountIdentifierRequiredError, ProvisioningResponsibleNotInDepartmentError,
 * ProvisioningResponsibleInvalidError, ProvisioningAnotherItAdminNeededError and AssignmentConflictError.
 */
@Injectable()
export class ProvisioningGrantService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly planner: ProvisioningGrantPlanner,
    private readonly writer: ProvisioningGrantWriter,
    private readonly views: ProvisioningTaskViewService,
  ) {}

  async grant(
    actor: AuthenticatedPrincipal,
    input: GrantInput,
  ): Promise<{ task: TaskView; warnings: 'DEPARTMENT_WITHOUT_IT_ADMIN'[] }> {
    const planned = await this.planner.plan(actor, input);
    const record = await this.runner.run((tx) => this.writer.write(tx, actor, input, planned));

    return { task: (await this.views.views([record]))[0], warnings: grantWarnings(planned.inCharge) };
  }
}
