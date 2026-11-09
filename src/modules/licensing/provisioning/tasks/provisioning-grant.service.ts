import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { ProvisioningTaskViewService, type TaskView } from '../provisioning-task-view.service';
import { ProvisioningGrantPlanner, type GrantInput } from './provisioning-grant-planner.service';
import { grantWarnings } from './provisioning-grant.policy';
import { ProvisioningGrantWriter } from './provisioning-grant-writer.service';
import { ProvisioningPurchaseRefusal } from './provisioning-purchase-refusal.service';
import { PurchaseNotAllowedError } from '../../shared-pool/shared-pool.errors';

/**
 * Grants the seat of a request: the assignment (source REQUEST, from today) and a manual task in the queue of the IT Admin in charge of
 * the department of whoever holds it. A personal seat is the beneficiary's, under a company account; a service account (`US-05-21`) is
 * answered for by a person of the department that owns it, under the identifier the IT Admin enters. The seat goes only on a subscription of
 * the plan: the one the IT Admin names or, when none is named, the one the shared pool of the plan gives (`BR-MF1-09`), whoever owns it. Throws ProvisioningItAdminRequiredError,
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
    private readonly refusals: ProvisioningPurchaseRefusal,
  ) {}

  async grant(
    actor: AuthenticatedPrincipal,
    input: GrantInput,
  ): Promise<{ task: TaskView; warnings: 'DEPARTMENT_WITHOUT_IT_ADMIN'[] }> {
    const planned = await this.planner.plan(actor, input);
    let record;
    try {
      record = await this.runner.run((tx) => this.writer.write(tx, actor, input, planned));
    } catch (error) {
      // The grant rolled back with nothing kept; the refusal of the purchase is the one thing that is (`US-07-13` AC-2).
      if (error instanceof PurchaseNotAllowedError) {
        await this.refusals.record(actor, {
          organizationId: planned.organization.id,
          requestId: input.requestId,
          planId: planned.plan.planId,
          refusal: error,
        });
      }
      throw error;
    }

    return { task: (await this.views.views([record]))[0], warnings: grantWarnings(planned.inCharge) };
  }
}
